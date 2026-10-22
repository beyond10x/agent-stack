import type { AgentStack, Layer, StackEdge, StackNode } from './types.ts';

export interface Neighbourhood {
  nodes: Set<string>;
  edges: Set<number>;
}

export interface Link {
  index: number;
  edge: StackEdge;
  peer: StackNode;
}

export function neighbourhood(stack: AgentStack, id: string): Neighbourhood {
  const nodes = new Set<string>([id]);
  const edges = new Set<number>();
  stack.edges.forEach((edge, index) => {
    if (edge.from === id || edge.to === id) {
      edges.add(index);
      nodes.add(edge.from);
      nodes.add(edge.to);
    }
  });
  return { nodes, edges };
}

export function links(stack: AgentStack, id: string): { incoming: Link[]; outgoing: Link[] } {
  const byId = new Map(stack.nodes.map((node) => [node.id, node]));
  const incoming: Link[] = [];
  const outgoing: Link[] = [];
  stack.edges.forEach((edge, index) => {
    if (edge.to === id) incoming.push({ index, edge, peer: byId.get(edge.from)! });
    if (edge.from === id) outgoing.push({ index, edge, peer: byId.get(edge.to)! });
  });
  return { incoming, outgoing };
}

export function layersTopDown(stack: AgentStack): Layer[] {
  return [...stack.layers].sort((a, b) => b.rank - a.rank);
}

export function nodesInReadingOrder(stack: AgentStack): StackNode[] {
  const rank = new Map(stack.layers.map((layer) => [layer.id, layer.rank]));
  return stack.nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => rank.get(b.node.layer)! - rank.get(a.node.layer)! || a.index - b.index)
    .map(({ node }) => node);
}
