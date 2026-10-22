import type { AgentStack, Flow } from './types.ts';

export interface Segment {
  edge: number;
  from: string;
  to: string;
  reverse: boolean;
}

export interface FlowState {
  nodes: Set<string>;
  edges: Set<number>;
  active: Segment | null;
}

export function resolveFlow(stack: AgentStack, flow: Flow): Segment[] {
  const segments: Segment[] = [];
  for (let position = 1; position < flow.steps.length; position++) {
    const from = flow.steps[position - 1];
    const to = flow.steps[position];
    let edge = stack.edges.findIndex((candidate) => candidate.from === from && candidate.to === to);
    let reverse = false;
    if (edge < 0) {
      edge = stack.edges.findIndex((candidate) => candidate.from === to && candidate.to === from);
      reverse = true;
    }
    if (edge < 0) throw new Error(`flow ${flow.id}: no edge joins ${from} and ${to}`);
    segments.push({ edge, from, to, reverse });
  }
  return segments;
}

export function flowState(flow: Flow, segments: Segment[], cursor: number, progress: number): FlowState {
  const done = Math.max(0, Math.min(cursor, segments.length));
  const nodes = new Set<string>(flow.steps.slice(0, done + 1));
  const edges = new Set<number>(segments.slice(0, done).map((segment) => segment.edge));
  const active = done < segments.length && progress > 0 ? segments[done] : null;
  if (active) {
    edges.add(active.edge);
    if (progress >= 1) nodes.add(active.to);
  }
  return { nodes, edges, active };
}

export interface Timing {
  travel: number;
  dwell: number;
  rest: number;
}

export const DEFAULT_TIMING: Timing = { travel: 1100, dwell: 420, rest: 1800 };

export function cycleLength(segments: number, timing: Timing = DEFAULT_TIMING): number {
  return segments * (timing.travel + timing.dwell) + timing.rest;
}

export function positionAt(elapsed: number, segments: number, timing: Timing = DEFAULT_TIMING): { cursor: number; progress: number } {
  const total = cycleLength(segments, timing);
  const t = ((elapsed % total) + total) % total;
  const slot = timing.travel + timing.dwell;
  const cursor = Math.floor(t / slot);
  if (cursor >= segments) return { cursor: segments, progress: 0 };
  const within = t - cursor * slot;
  if (within >= timing.travel) return { cursor: cursor + 1, progress: 0 };
  return { cursor, progress: within / timing.travel };
}

export function elapsedFor(done: number, timing: Timing = DEFAULT_TIMING): number {
  if (done <= 0) return 0;
  return (done - 1) * (timing.travel + timing.dwell) + timing.travel;
}
