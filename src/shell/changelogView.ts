import changelog from '../../CHANGELOG.md?raw'
import { renderChangelog } from './markdown'

// The only importer of the changelog text, loaded on the first click on the version label.
export const renderBundledChangelog = (): HTMLElement[] => renderChangelog(changelog)
