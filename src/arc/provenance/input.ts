import type { ProvenanceDataset, ProvenanceIndex, ProvenanceNode, ProvenanceProcess, ProvenanceRow } from './types'

// The provenance data a host hands to ARCade. Plain JSON, so a host may build
// it from its own data or post it across frames. A full ProvenanceIndex is
// accepted as is.
export interface ArcadeProvenance {
  datasets: ProvenanceDataset[]
  processes: ProvenanceProcess[]
  rows: ProvenanceRow[]
  nodes: ProvenanceNode[]
}

function indexRowsByNode(rows: ProvenanceRow[], side: 'inputs' | 'outputs'): Map<string, string[]> {
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

// Derives the lookup maps the game reads from the plain arrays.
export function indexProvenance(data: ArcadeProvenance): ProvenanceIndex {
  const { datasets, processes, rows, nodes } = data
  const groups = processes.flatMap((process) => [...(process.inputGroups ?? []), ...(process.outputGroups ?? [])])
  return {
    datasets,
    processes,
    rows,
    nodes,
    datasetById: new Map(datasets.map((dataset) => [dataset.id, dataset])),
    processByKey: new Map(processes.map((process) => [process.key, process])),
    rowById: new Map(rows.map((row) => [row.id, row])),
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    groupById: new Map(groups.map((group) => [group.id, group])),
    producedBy: indexRowsByNode(rows, 'outputs'),
    consumedBy: indexRowsByNode(rows, 'inputs'),
  }
}
