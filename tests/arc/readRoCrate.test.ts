import { describe, expect, it } from 'vitest'
import { indexProvenance, type ArcadeProvenance } from '../../src/arc/provenance/input'
import { readRoCrate } from '../../src/arc'
import { buildProvenanceIndex } from '../../src/arc/provenance/buildIndex'
import { planRun } from '../../src/game/model/run'
import { ARC } from '@nfdi4plants/arctrl'
import { crateJson } from '../helpers/sampleCrate'

describe('readRoCrate on the sample ARC', () => {
  it('returns the title and plain arrays', () => {
    const { title, provenance } = readRoCrate(crateJson)
    expect(title).toBeTruthy()
    expect(provenance.datasets.length).toBeGreaterThan(0)
    expect(provenance.rows.length).toBeGreaterThan(0)
    expect(provenance.nodes.length).toBeGreaterThan(0)
    expect(provenance.processes.length).toBeGreaterThan(0)
  })

  it('plans the same run after a JSON round trip as from the built index', () => {
    const { title, provenance } = readRoCrate(crateJson)
    const revived = JSON.parse(JSON.stringify(provenance)) as ArcadeProvenance
    const direct = planRun(buildProvenanceIndex(ARC.fromROCrateJsonString(crateJson)), title, 'round-trip')
    expect(direct).not.toBeNull()
    expect(planRun(indexProvenance(revived), title, 'round-trip')).toEqual(direct)
    expect(structuredClone(provenance)).toEqual(provenance)
  })
})

describe('a hand-written ArcadeProvenance', () => {
  it('plans a run with only the required fields', () => {
    const data: ArcadeProvenance = {
      datasets: [{ id: 'd', kind: 'assay' }],
      processes: [{ key: 'p', name: 'Process', signatures: [{ rowIds: ['r1', 'r2'], annotations: [] }] }],
      rows: [
        { id: 'r1', processKey: 'p', datasetId: 'd', inputs: ['a'], outputs: ['b'] },
        { id: 'r2', processKey: 'p', datasetId: 'd', inputs: ['b'], outputs: ['c'] },
      ],
      nodes: [
        { id: 'a', kind: 'source', annotations: [] },
        { id: 'b', kind: 'sample', annotations: [] },
        { id: 'c', kind: 'data', annotations: [] },
      ],
    }
    const plan = planRun(indexProvenance(data), 'Tiny', 'seed')
    expect(plan).not.toBeNull()
  })
})
