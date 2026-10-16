// Vite replaces __ARCADE_VERSION__ with the version in package.json at build time.
declare const __ARCADE_VERSION__: string

export const ARCADE_VERSION: string = typeof __ARCADE_VERSION__ === 'string' ? __ARCADE_VERSION__ : ''
