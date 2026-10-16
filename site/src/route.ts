import { DEFAULT_HUB, findHub, type Hub } from './hubs'

export type Route =
  | { view: 'picker' }
  | { view: 'sample' }
  | { view: 'arc'; hub: Hub; projectId: number; seed: string | null }
  | { view: 'error'; message: string }

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search)
  if (params.get('sample') === 'talinum') return { view: 'sample' }
  const project = params.get('project')
  const hubParam = params.get('hub')
  if (hubParam !== null && !findHub(hubParam)) {
    return { view: 'error', message: 'Unknown hub. Only the listed GitLab hubs are supported.' }
  }
  if (project === null) return { view: 'picker' }
  if (!/^[1-9]\d{0,12}$/.test(project)) return { view: 'error', message: 'The project id must be a number.' }
  const hub = findHub(hubParam) ?? DEFAULT_HUB
  const seed = params.get('seed')
  return { view: 'arc', hub, projectId: Number(project), seed: seed ? seed : null }
}

export function routeUrl(route: { view: 'picker' } | { view: 'sample' } | { view: 'arc'; hub: Hub; projectId: number }, base = '/'): string {
  const params = new URLSearchParams()
  if (route.view === 'sample') params.set('sample', 'talinum')
  if (route.view === 'arc') {
    if (route.hub.id !== DEFAULT_HUB.id) params.set('hub', route.hub.id)
    params.set('project', String(route.projectId))
  }
  const query = params.toString()
  return `${base}${query ? `?${query}` : ''}`
}
