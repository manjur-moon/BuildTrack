export type DependencyEdge = { predecessorTaskId: string; successorTaskId: string };

/** Adding predecessor -> successor creates a cycle iff successor already reaches predecessor. */
export function createsDependencyCycle(edges: readonly DependencyEdge[], predecessor: string, successor: string): boolean {
  if (predecessor === successor) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const next = adjacency.get(edge.predecessorTaskId) ?? [];
    next.push(edge.successorTaskId);
    adjacency.set(edge.predecessorTaskId, next);
  }
  const pending = [successor];
  const seen = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    if (node === predecessor) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) pending.push(next);
  }
  return false;
}
