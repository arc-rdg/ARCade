export interface Hub {
  id: string
  name: string
  origin: string
}

/** Allowlist: only these GitLab instances are ever contacted (see the CSP in index.html). */
export const HUBS: readonly Hub[] = [
  { id: 'plantdatahub', name: 'PLANTDataHUB', origin: 'https://git.nfdi4plants.org' },
  { id: 'plantmicrobe', name: 'PlantMicrobe', origin: 'https://gitlab.plantmicrobe.de' },
]

export const DEFAULT_HUB: Hub = HUBS[0]

export function findHub(id: string | null | undefined): Hub | null {
  if (id == null) return null
  return HUBS.find((hub) => hub.id === id) ?? null
}

export function tokenSettingsUrl(hub: Hub): string {
  return `${hub.origin}/-/user_settings/personal_access_tokens?name=ARCade&scopes=read_api`
}
