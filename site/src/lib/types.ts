export const SCHEMA = 'b10x-agent-stack/v1';

export const NODE_KINDS = ['repository', 'library', 'vendor', 'provider', 'product', 'actor'] as const;
export const NODE_STATUSES = ['active', 'paused', 'proposed'] as const;
export const EDGE_KINDS = ['calls', 'builds-on', 'drives', 'contains'] as const;

export type NodeKind = (typeof NODE_KINDS)[number];
export type NodeStatus = (typeof NODE_STATUSES)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface Layer {
  id: string;
  rank: number;
  name: string;
  summary: string;
}

export interface StackNode {
  id: string;
  label: string;
  layer: string;
  kind: NodeKind;
  status: NodeStatus;
  definition: string;
  repository: string | null;
  github: string | null;
  docs: string | null;
}

export interface StackEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
}

export interface Flow {
  id: string;
  label: string;
  steps: string[];
}

export interface AgentStack {
  schema: typeof SCHEMA;
  layers: Layer[];
  nodes: StackNode[];
  edges: StackEdge[];
  flows: Flow[];
}
