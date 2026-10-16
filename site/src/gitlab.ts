import type { Session } from './auth'

export interface GitLabProject {
  id: number
  name: string
  path_with_namespace: string
  namespace?: { full_path?: string; name?: string } | null
  description?: string | null
  last_activity_at?: string
  visibility?: string
  web_url: string
}

export interface Page<T> {
  items: T[]
  nextPage: number | null
}

export class GitLabError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'GitLabError'
    this.status = status
  }
}

/**
 * Every request goes to the session hub's origin. The token is sent only as `Authorization: Bearer`
 * (browsers drop it on the cross-origin redirect to S3; a custom header such as PRIVATE-TOKEN would leak).
 */
export async function gitlabFetch(session: Session, path: string, params: URLSearchParams | null, signal?: AbortSignal): Promise<Response> {
  const url = new URL(`/api/v4/${path}`, session.hub.origin)
  if (params) url.search = params.toString()
  const headers = new Headers({ Accept: 'application/json' })
  if (session.token) headers.set('Authorization', `Bearer ${session.token}`)
  try {
    return await fetch(url, { headers, signal, credentials: 'omit' })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new GitLabError(`Could not reach ${session.hub.origin}.`, 0)
  }
}

function isProject(value: unknown): value is GitLabProject {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'number' && typeof v.name === 'string' && typeof v.path_with_namespace === 'string'
    && typeof v.web_url === 'string'
}

/** Search backend; the portal API can become a second implementation later. */
export interface ArcSource {
  search(query: string, page: number, signal?: AbortSignal): Promise<Page<GitLabProject>>
}

export const EXPIRED_MESSAGE = 'Your login expired. Log in again.'

export function gitlabSource(session: Session, options: { mine?: boolean; onExpired?: () => void } = {}): ArcSource {
  async function run(token: string | null, query: string, page: number, signal?: AbortSignal): Promise<Page<GitLabProject>> {
    const params = new URLSearchParams({ order_by: 'last_activity_at', sort: 'desc', page: String(page), per_page: '20' })
    if (query.trim()) params.set('search', query.trim())
    if (token && options.mine) params.set('membership', 'true')
    else if (!token) params.set('visibility', 'public')
    const response = await gitlabFetch({ hub: session.hub, token }, 'projects', params, signal)
    if (response.status === 401 && token) {
      // Expired or revoked: forget it and continue as a visitor.
      options.onExpired?.()
      return run(null, query, page, signal)
    }
    if (!response.ok) throw new GitLabError(describe(response.status), response.status)
    const data: unknown = await response.json()
    if (!Array.isArray(data) || !data.every(isProject)) throw new GitLabError('GitLab returned an unexpected answer.', response.status)
    const next = Number(response.headers.get('x-next-page'))
    return { items: data, nextPage: Number.isSafeInteger(next) && next > 0 ? next : null }
  }
  return { search: (query, page, signal) => run(session.token, query, page, signal) }
}

function describe(status: number): string {
  if (status === 401) return 'The token is invalid or expired.'
  if (status === 403) return 'Access denied.'
  if (status === 404) return 'Not found.'
  return `GitLab answered with status ${status}.`
}

export class NoArcJsonError extends Error {
  constructor() {
    super('This ARC has no ARC JSON yet.')
    this.name = 'NoArcJsonError'
  }
}

/**
 * The ARC JSON (RO-Crate) published by the hub's CI, read as text. It is requested without the token
 * first, so public ARCs never send it through the S3 redirect; the token is only used on 401/403/404.
 */
export async function fetchCrate(session: Session, projectId: number, signal?: AbortSignal, onExpired?: () => void): Promise<string> {
  const path = `projects/${projectId}/packages/generic/isa_arc_json/0.0.1/arc-ro-crate-metadata.json`
  let response = await gitlabFetch({ hub: session.hub, token: null }, path, null, signal)
  if (!response.ok && session.token && [401, 403, 404].includes(response.status)) {
    response = await gitlabFetch(session, path, null, signal)
    if (response.status === 401) {
      onExpired?.()
      throw new GitLabError(EXPIRED_MESSAGE, 401)
    }
  }
  if (response.status === 404) throw new NoArcJsonError()
  if (!response.ok) {
    const hidden = !session.token && (response.status === 401 || response.status === 403)
    throw new GitLabError(hidden
      ? 'This ARC was not found, is private, or does not share its ARC JSON publicly. Log in if you have access.'
      : describe(response.status), response.status)
  }
  return response.text()
}

export async function fetchProject(session: Session, projectId: number, signal?: AbortSignal): Promise<GitLabProject | null> {
  const response = await gitlabFetch(session, `projects/${projectId}`, null, signal)
  if (!response.ok) return null
  const data: unknown = await response.json()
  return isProject(data) ? data : null
}

/** Checks that the token works for what the site needs: listing projects (needs read_api). */
export async function validateToken(session: Session, signal?: AbortSignal): Promise<void> {
  const response = await gitlabFetch(session, 'projects', new URLSearchParams({ per_page: '1', membership: 'true' }), signal)
  if (response.status === 401) throw new GitLabError('The token is invalid or expired.', 401)
  if (response.status === 403) throw new GitLabError('The token needs the read_api scope.', 403)
  if (!response.ok) throw new GitLabError(describe(response.status), response.status)
}
