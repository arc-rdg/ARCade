// A heavy attack with a tell shows the tell text this long before its danger zone appears, so a
// well-annotated step can be read in time. Without a tell the attack starts at once.
export const TELL_LEAD_MS = 300

export interface Lead<A> {
  spec: A | null
  ms: number
}

export function createLead<A>(): Lead<A> {
  return { spec: null, ms: 0 }
}

export function leadMsFor(heavy: boolean, hasTell: boolean): number {
  return heavy && hasTell ? TELL_LEAD_MS : 0
}

// Counts the lead down. Returns the attack that is due now, once, or null.
export function tickLead<A>(lead: Lead<A>, dtMs: number): A | null {
  if (!lead.spec) return null
  lead.ms -= dtMs
  if (lead.ms > 0) return null
  const due = lead.spec
  lead.spec = null
  lead.ms = 0
  return due
}
