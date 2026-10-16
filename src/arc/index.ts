import { ARC } from '@nfdi4plants/arctrl'
import type { ArcadeProvenance } from './provenance/input'
import { buildProvenanceIndex } from './provenance/buildIndex'

export type { ArcadeProvenance } from './provenance/input'

// Plain arrays only (no Maps), so the result survives structuredClone and a JSON round trip.
export function provenanceFromArc(arc: ARC): ArcadeProvenance {
  const { datasets, processes, rows, nodes } = buildProvenanceIndex(arc)
  return { datasets, processes, rows, nodes }
}

// Parses an ARC RO-Crate (ro-crate-metadata.json) and returns its title and provenance.
export function readRoCrate(json: string): { title: string; provenance: ArcadeProvenance } {
  const arc = ARC.fromROCrateJsonString(json)
  return { title: arc.Title ?? arc.Identifier, provenance: provenanceFromArc(arc) }
}
