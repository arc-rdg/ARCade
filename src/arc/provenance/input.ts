import type { Annotation, DatasetKind, IoKind } from './types'

// The provenance data a host hands to ARCade: only what the game reads, as
// plain JSON, so a host may build it from its own data or post it across
// frames. Extra fields are allowed, so a full ProvenanceIndex is accepted as is.
export interface ArcadeNode {
  id: string
  kind: IoKind
  annotations: Annotation[]
}

export interface ArcadeRow {
  id: string
  processKey: string
  datasetId: string
  inputs: string[]
  outputs: string[]
}

export interface ArcadeProcess {
  key: string
  name: string
  signatures: { rowIds: string[]; annotations: Annotation[] }[]
}

export interface ArcadeDataset {
  id: string
  kind: DatasetKind
}

export interface ArcadeProvenance {
  datasets: ArcadeDataset[]
  processes: ArcadeProcess[]
  rows: ArcadeRow[]
  nodes: ArcadeNode[]
}

// The lookup maps the game reads, derived from the plain arrays.
export interface ArcadeIndex {
  datasets: ArcadeDataset[]
  processes: ArcadeProcess[]
  rows: ArcadeRow[]
  nodes: ArcadeNode[]
  datasetById: Map<string, ArcadeDataset>
  processByKey: Map<string, ArcadeProcess>
  rowById: Map<string, ArcadeRow>
  nodeById: Map<string, ArcadeNode>
  // node id -> ids of the rows that produce or consume it
  producedBy: Map<string, string[]>
  consumedBy: Map<string, string[]>
}

function indexRowsByNode(rows: ArcadeRow[], side: 'inputs' | 'outputs'): Map<string, string[]> {
  const byNode = new Map<string, string[]>()
  for (const row of rows) {
    for (const id of row[side]) {
      const list = byNode.get(id) ?? []
      list.push(row.id)
      byNode.set(id, list)
    }
  }
  return byNode
}

export function indexProvenance(data: ArcadeProvenance): ArcadeIndex {
  const { datasets, processes, rows, nodes } = data
  return {
    datasets,
    processes,
    rows,
    nodes,
    datasetById: new Map(datasets.map((dataset) => [dataset.id, dataset])),
    processByKey: new Map(processes.map((process) => [process.key, process])),
    rowById: new Map(rows.map((row) => [row.id, row])),
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    producedBy: indexRowsByNode(rows, 'outputs'),
    consumedBy: indexRowsByNode(rows, 'inputs'),
  }
}
