import {
  EDGE_KINDS,
  NODE_KINDS,
  NODE_STATUSES,
  SCHEMA,
  type AgentStack,
  type Flow,
  type Layer,
  type StackEdge,
  type StackNode,
} from './types.ts';

export type Validation = { ok: true; stack: AgentStack } | { ok: false; errors: string[] };

const MAX_DEFINITION = 160;
const GITHUB_PREFIX = 'https://github.com/beyond10x/';

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/.test(value);
}

function exactKeys(value: Record_, keys: readonly string[], where: string, errors: string[]): void {
  for (const key of keys) if (!(key in value)) errors.push(`${where}: missing "${key}"`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${where}: unknown "${key}"`);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function nullableText(value: unknown): boolean {
  return value === null || isText(value);
}

export function isSiteRoute(value: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9._~\-/]*(#[A-Za-z0-9._~-]+)?$/.test(value);
}

export function isGithubUrl(value: string): boolean {
  return value.startsWith(GITHUB_PREFIX) && /^[A-Za-z0-9._-]+$/.test(value.slice(GITHUB_PREFIX.length));
}

function array(value: Record_, key: string, errors: string[]): unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) {
    errors.push(`"${key}" must be an array`);
    return [];
  }
  return field;
}

function uniqueIds(items: Record_[], where: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== 'string') continue;
    if (ids.has(item.id)) errors.push(`${where}: duplicate id "${item.id}"`);
    ids.add(item.id);
  }
  return ids;
}

export function validateAgentStack(input: unknown): Validation {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['document must be an object'] };
  exactKeys(input, ['schema', 'layers', 'nodes', 'edges', 'flows'], 'document', errors);
  if (input.schema !== SCHEMA) errors.push(`schema must be "${SCHEMA}"`);

  const layers = array(input, 'layers', errors);
  const nodes = array(input, 'nodes', errors);
  const edges = array(input, 'edges', errors);
  const flows = array(input, 'flows', errors);

  const ranks = new Set<number>();
  layers.forEach((layer, index) => {
    const where = `layers[${index}]`;
    if (!isRecord(layer)) return void errors.push(`${where}: must be an object`);
    exactKeys(layer, ['id', 'rank', 'name', 'summary'], where, errors);
    if (!isText(layer.id)) errors.push(`${where}: id must be text`);
    if (!Number.isInteger(layer.rank) || (layer.rank as number) < 0) errors.push(`${where}: rank must be a non-negative integer`);
    else if (ranks.has(layer.rank as number)) errors.push(`${where}: duplicate rank ${layer.rank}`);
    else ranks.add(layer.rank as number);
    if (!isText(layer.name)) errors.push(`${where}: name must be text`);
    if (!isText(layer.summary)) errors.push(`${where}: summary must be text`);
  });
  const layerIds = uniqueIds(layers.filter(isRecord), 'layers', errors);
  if (layers.length === 0) errors.push('layers must not be empty');

  nodes.forEach((node, index) => {
    const where = `nodes[${index}]`;
    if (!isRecord(node)) return void errors.push(`${where}: must be an object`);
    exactKeys(node, ['id', 'label', 'layer', 'kind', 'status', 'definition', 'repository', 'github', 'docs'], where, errors);
    if (typeof node.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(node.id)) errors.push(`${where}: id must be kebab-case`);
    if (!isText(node.label)) errors.push(`${where}: label must be text`);
    if (typeof node.layer !== 'string' || !layerIds.has(node.layer)) errors.push(`${where}: layer "${String(node.layer)}" is not a layer id`);
    if (!oneOf(node.kind, NODE_KINDS)) errors.push(`${where}: kind "${String(node.kind)}" is not one of ${NODE_KINDS.join(', ')}`);
    if (!oneOf(node.status, NODE_STATUSES)) errors.push(`${where}: status "${String(node.status)}" is not one of ${NODE_STATUSES.join(', ')}`);
    if (!isText(node.definition)) errors.push(`${where}: definition must be one line of text`);
    else if (node.definition.length > MAX_DEFINITION) errors.push(`${where}: definition exceeds ${MAX_DEFINITION} characters`);
    if (!nullableText(node.repository)) errors.push(`${where}: repository must be text or null`);
    if (node.github !== null && !(typeof node.github === 'string' && isGithubUrl(node.github))) errors.push(`${where}: github must be null or ${GITHUB_PREFIX}<repository>`);
    if (node.docs !== null && !(typeof node.docs === 'string' && isSiteRoute(node.docs))) errors.push(`${where}: docs must be null or a site-relative route`);
  });
  const nodeIds = uniqueIds(nodes.filter(isRecord), 'nodes', errors);

  const joined = new Set<string>();
  edges.forEach((edge, index) => {
    const where = `edges[${index}]`;
    if (!isRecord(edge)) return void errors.push(`${where}: must be an object`);
    exactKeys(edge, ['from', 'to', 'kind', 'label'], where, errors);
    for (const end of ['from', 'to'] as const) {
      if (typeof edge[end] !== 'string' || !nodeIds.has(edge[end] as string)) errors.push(`${where}: ${end} "${String(edge[end])}" is not a node id`);
    }
    if (edge.from === edge.to) errors.push(`${where}: an edge must join two different nodes`);
    if (!oneOf(edge.kind, EDGE_KINDS)) errors.push(`${where}: kind "${String(edge.kind)}" is not one of ${EDGE_KINDS.join(', ')}`);
    if (!isText(edge.label)) errors.push(`${where}: label must be text`);
    joined.add(`${String(edge.from)}\u0000${String(edge.to)}`);
  });

  flows.forEach((flow, index) => {
    const where = `flows[${index}]`;
    if (!isRecord(flow)) return void errors.push(`${where}: must be an object`);
    exactKeys(flow, ['id', 'label', 'steps'], where, errors);
    if (!isText(flow.id)) errors.push(`${where}: id must be text`);
    if (!isText(flow.label)) errors.push(`${where}: label must be text`);
    if (!Array.isArray(flow.steps) || flow.steps.length < 2) return void errors.push(`${where}: steps must list at least two nodes`);
    flow.steps.forEach((step, position) => {
      if (typeof step !== 'string' || !nodeIds.has(step)) errors.push(`${where}: step ${position} "${String(step)}" is not a node id`);
      if (position === 0) return;
      const previous = String((flow.steps as unknown[])[position - 1]);
      const current = String(step);
      if (!joined.has(`${previous}\u0000${current}`) && !joined.has(`${current}\u0000${previous}`)) {
        errors.push(`${where}: steps "${previous}" and "${current}" are not joined by an edge`);
      }
    });
  });
  uniqueIds(flows.filter(isRecord), 'flows', errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    stack: {
      schema: SCHEMA,
      layers: layers as Layer[],
      nodes: nodes as StackNode[],
      edges: edges as StackEdge[],
      flows: flows as Flow[],
    },
  };
}
