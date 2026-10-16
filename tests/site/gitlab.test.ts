import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToken, loadToken, saveToken } from '../../site/src/auth'
import { fetchCrate, gitlabSource, NoArcJsonError } from '../../site/src/gitlab'
import { DEFAULT_HUB, findHub, HUBS } from '../../site/src/hubs'
import { parseRoute, routeUrl } from '../../site/src/route'

const plantmicrobe = HUBS[1]

function mockFetch(respond: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; headers: Headers; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({ url: input, headers: new Headers(init.headers), init })
    return respond(input, init)
  }))
  return calls
}

const project = { id: 1, name: 'A', path_with_namespace: 'g/a', web_url: 'https://x/g/a' }

describe('GitLab client', () => {
  it('sends the token as Bearer to the hub origin only, never as PRIVATE-TOKEN', async () => {
    const calls = mockFetch(() => new Response('[]', { status: 200 }))
    await gitlabSource({ hub: plantmicrobe, token: 'secret' }).search('x', 1)
    expect(calls[0].url.origin).toBe(plantmicrobe.origin)
    expect(calls[0].headers.get('authorization')).toBe('Bearer secret')
    expect(calls[0].headers.has('private-token')).toBe(false)
    expect(calls[0].init.credentials).toBe('omit')
  })

  it('sends no auth header without a token and asks for public projects only', async () => {
    const calls = mockFetch(() => new Response('[]', { status: 200 }))
    await gitlabSource({ hub: DEFAULT_HUB, token: null }).search('', 1)
    expect(calls[0].headers.has('authorization')).toBe(false)
    expect(calls[0].url.searchParams.get('visibility')).toBe('public')
  })

  it('filters by membership for My ARCs when logged in', async () => {
    const calls = mockFetch(() => new Response('[]', { status: 200 }))
    await gitlabSource({ hub: DEFAULT_HUB, token: 't' }, { mine: true }).search('', 1)
    expect(calls[0].url.searchParams.get('membership')).toBe('true')
    expect(calls[0].url.searchParams.has('visibility')).toBe(false)
  })

  it('pages through x-next-page', async () => {
    mockFetch((url) => new Response(JSON.stringify([project]), {
      status: 200,
      headers: url.searchParams.get('page') === '1' ? { 'x-next-page': '2' } : { 'x-next-page': '' },
    }))
    const source = gitlabSource({ hub: DEFAULT_HUB, token: null })
    expect((await source.search('', 1)).nextPage).toBe(2)
    expect((await source.search('', 2)).nextPage).toBeNull()
  })

  it('fetches a public crate without the token', async () => {
    const calls = mockFetch(() => new Response('{}', { status: 200 }))
    await fetchCrate({ hub: DEFAULT_HUB, token: 'secret' }, 5)
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.has('authorization')).toBe(false)
  })

  it('retries a hidden crate with the token', async () => {
    const calls = mockFetch((_url, init) => new Response('{}', { status: new Headers(init.headers).has('authorization') ? 200 : 401 }))
    await fetchCrate({ hub: DEFAULT_HUB, token: 'secret' }, 5)
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual([null, 'Bearer secret'])
  })

  it('drops an expired token and retries the search without it', async () => {
    const onExpired = vi.fn()
    const calls = mockFetch((_url, init) => new Response('[]', { status: new Headers(init.headers).has('authorization') ? 401 : 200 }))
    await gitlabSource({ hub: DEFAULT_HUB, token: 'old' }, { onExpired }).search('', 1)
    expect(onExpired).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(2)
    expect(calls[1].headers.has('authorization')).toBe(false)
    expect(calls[1].url.searchParams.get('visibility')).toBe('public')
  })

  it('reports a missing ARC JSON on 404', async () => {
    mockFetch(() => new Response('{}', { status: 404 }))
    await expect(fetchCrate({ hub: DEFAULT_HUB, token: null }, 5)).rejects.toBeInstanceOf(NoArcJsonError)
  })
})

describe('hubs and routes', () => {
  it('rejects unknown hub ids from the URL', () => {
    expect(findHub('evil')).toBeNull()
    expect(parseRoute('?hub=evil&project=1').view).toBe('error')
  })

  it('parses the routes', () => {
    expect(parseRoute('')).toEqual({ view: 'picker' })
    expect(parseRoute('?sample=talinum')).toEqual({ view: 'sample' })
    expect(parseRoute('?project=1040')).toEqual({ view: 'arc', hub: DEFAULT_HUB, projectId: 1040, seed: null })
    expect(parseRoute('?hub=plantmicrobe&project=7&seed=abc')).toEqual({ view: 'arc', hub: plantmicrobe, projectId: 7, seed: 'abc' })
    expect(parseRoute('?project=abc').view).toBe('error')
  })

  it('omits the default hub from generated URLs', () => {
    expect(routeUrl({ view: 'arc', hub: DEFAULT_HUB, projectId: 3 }, '/ARCade/')).toBe('/ARCade/?project=3')
    expect(routeUrl({ view: 'arc', hub: plantmicrobe, projectId: 3 }, '/ARCade/')).toBe('/ARCade/?hub=plantmicrobe&project=3')
  })
})

describe('token storage', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
  afterEach(() => { clearToken(DEFAULT_HUB); clearToken(plantmicrobe) })

  it('keeps the token in sessionStorage by default', () => {
    saveToken(DEFAULT_HUB, 'a', false)
    expect(sessionStorage.length).toBe(1)
    expect(localStorage.length).toBe(0)
    expect(loadToken(DEFAULT_HUB)).toBe('a')
  })

  it('uses localStorage only when remembered, and binds it to its hub', () => {
    saveToken(DEFAULT_HUB, 'a', true)
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
    expect(loadToken(DEFAULT_HUB)).toBe('a')
    expect(loadToken(plantmicrobe)).toBeNull()
    clearToken(DEFAULT_HUB)
    expect(loadToken(DEFAULT_HUB)).toBeNull()
  })
})
