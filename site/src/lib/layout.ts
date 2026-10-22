import type { AgentStack, Layer } from './types.ts';
import { layersTopDown } from './graph.ts';

export interface LayoutOptions {
  width: number;
  minHeight?: number;
  dense?: boolean;
}

export interface Band {
  layer: Layer;
  index: number;
  y: number;
  height: number;
  rows: number;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  band: number;
}

export interface EdgePath {
  index: number;
  d: string;
}

export interface Layout {
  width: number;
  height: number;
  compact: boolean;
  gutter: number;
  bandHeader: number;
  bands: Band[];
  boxes: Map<string, Box>;
  edges: EdgePath[];
}

export const COMPACT_BELOW = 720;
const PAD = 16;
const CARD_H = 58;
const ROW_GAP = 18;
const DESKTOP = { gutter: 220, cardW: 178, gap: 30, padY: 18, header: 0, maxBand: 170 };
const COMPACT = { gutter: 0, gap: 12, padY: 12, header: 46 };
const DENSE = { gap: 8, padY: 8, header: 30 };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeLayout(stack: AgentStack, options: LayoutOptions): Layout {
  const width = Math.max(280, Math.floor(options.width));
  const compact = width < COMPACT_BELOW;
  const gutter = compact ? COMPACT.gutter : DESKTOP.gutter;
  const dense = compact && options.dense === true;
  const gap = dense ? DENSE.gap : compact ? COMPACT.gap : DESKTOP.gap;
  const padY = dense ? DENSE.padY : compact ? COMPACT.padY : DESKTOP.padY;
  const bandHeader = dense ? DENSE.header : compact ? COMPACT.header : DESKTOP.header;
  const inner = width - gutter - PAD * 2;
  const columns = compact
    ? dense ? (width < 340 ? 2 : 3) : width < 340 ? 1 : 2
    : Math.max(1, Math.floor((inner + gap) / (DESKTOP.cardW + gap)));
  const cardW = compact ? (inner - gap * (columns - 1)) / columns : DESKTOP.cardW;

  const layers = layersTopDown(stack);
  const members = layers.map((layer) =>
    stack.nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.layer === layer.id),
  );
  const rows = members.map((list) => Math.max(1, Math.ceil(list.length / columns)));
  const natural = rows.map((count) => bandHeader + padY * 2 + count * CARD_H + (count - 1) * ROW_GAP);
  const naturalTotal = natural.reduce((sum, h) => sum + h, 0);
  const extra = !compact && options.minHeight && options.minHeight > naturalTotal
    ? (options.minHeight - naturalTotal) / layers.length
    : 0;
  const heights = natural.map((h) => (compact ? h : Math.max(h, Math.min(DESKTOP.maxBand, h + extra))));

  const bands: Band[] = [];
  let y = 0;
  layers.forEach((layer, index) => {
    bands.push({ layer, index, y: round(y), height: round(heights[index]), rows: rows[index] });
    y += heights[index];
  });
  const height = round(y);

  const adjacency = new Map<string, string[]>();
  for (const edge of stack.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }

  const boxes = new Map<string, Box>();
  members.forEach((list, bandIndex) => {
    const keyed = list.map(({ node, index }) => {
      const placed = (adjacency.get(node.id) ?? []).map((peer) => boxes.get(peer)).filter((box): box is Box => !!box);
      const centre = placed.length > 0 ? placed.reduce((sum, box) => sum + box.x + box.w / 2, 0) / placed.length : Number.POSITIVE_INFINITY;
      return { node, index, centre };
    });
    keyed.sort((a, b) => (a.centre === b.centre ? a.index - b.index : a.centre - b.centre));
    const band = bands[bandIndex];
    const content = rows[bandIndex] * CARD_H + (rows[bandIndex] - 1) * ROW_GAP;
    const top = band.y + bandHeader + (band.height - bandHeader - content) / 2;
    keyed.forEach(({ node }, slot) => {
      const row = Math.floor(slot / columns);
      const inRow = Math.min(columns, keyed.length - row * columns);
      const rowWidth = inRow * cardW + (inRow - 1) * gap;
      const left = gutter + PAD + (inner - rowWidth) / 2;
      const column = slot % columns;
      boxes.set(node.id, {
        id: node.id,
        x: round(left + column * (cardW + gap)),
        y: round(top + row * (CARD_H + ROW_GAP)),
        w: round(cardW),
        h: CARD_H,
        band: bandIndex,
      });
    });
  });

  return { width, height, compact, gutter, bandHeader, bands, boxes, edges: routeEdges(stack, boxes) };
}

type Side = 'top' | 'bottom';

interface Port {
  edge: number;
  node: string;
  side: Side;
  towards: number;
}

function routeEdges(stack: AgentStack, boxes: Map<string, Box>): EdgePath[] {
  const ports: Port[] = [];
  const shape = stack.edges.map((edge, index) => {
    const a = boxes.get(edge.from)!;
    const b = boxes.get(edge.to)!;
    const sameRow = Math.abs(a.y - b.y) < 1;
    const down = b.y > a.y;
    const fromSide: Side = sameRow || down ? 'bottom' : 'top';
    const toSide: Side = sameRow || !down ? 'bottom' : 'top';
    if (sameRow) {
      ports.push({ edge: index, node: edge.from, side: fromSide, towards: b.x });
      ports.push({ edge: index, node: edge.to, side: toSide, towards: a.x });
    } else {
      ports.push({ edge: index, node: edge.from, side: fromSide, towards: b.x + b.w / 2 });
      ports.push({ edge: index, node: edge.to, side: toSide, towards: a.x + a.w / 2 });
    }
    return { a, b, sameRow, fromSide, toSide };
  });

  const anchor = new Map<string, number>();
  const groups = new Map<string, Port[]>();
  for (const port of ports) {
    const key = `${port.node}:${port.side}`;
    groups.set(key, [...(groups.get(key) ?? []), port]);
  }
  for (const [key, group] of groups) {
    group.sort((p, q) => p.towards - q.towards || p.edge - q.edge);
    const box = boxes.get(key.slice(0, key.lastIndexOf(':')))!;
    const span = box.w * 0.6;
    group.forEach((port, position) => {
      const offset = group.length === 1 ? 0 : -span / 2 + (span * position) / (group.length - 1);
      anchor.set(`${port.edge}:${port.node}:${port.side}`, box.x + box.w / 2 + offset);
    });
  }

  return stack.edges.map((edge, index) => {
    const { a, b, sameRow, fromSide, toSide } = shape[index];
    const x1 = round(anchor.get(`${index}:${edge.from}:${fromSide}`)!);
    const x2 = round(anchor.get(`${index}:${edge.to}:${toSide}`)!);
    const y1 = round(fromSide === 'bottom' ? a.y + a.h : a.y);
    const y2 = round(toSide === 'bottom' ? b.y + b.h : b.y);
    if (sameRow) {
      const sag = round(y1 + 16 + Math.min(18, Math.abs(x2 - x1) / 12));
      return { index, d: `M${x1},${y1} C${x1},${sag} ${x2},${sag} ${x2},${y2}` };
    }
    const mid = round((y1 + y2) / 2);
    return { index, d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}` };
  });
}

const LABEL = { padX: 41, padY: 24, nameLine: 23, nameChar: 9, idChar: 7, idExtra: 22, summaryGap: 4, summaryLine: 16.9, maxLines: 3 };

export function summaryLines(band: Band, gutter: number): number {
  const nameWidth = band.layer.name.length * LABEL.nameChar + band.layer.id.length * LABEL.idChar + LABEL.idExtra;
  const nameLines = Math.max(1, Math.ceil(nameWidth / (gutter - LABEL.padX)));
  const room = band.height - LABEL.padY - nameLines * LABEL.nameLine - LABEL.summaryGap;
  return Math.max(0, Math.min(LABEL.maxLines, Math.floor(room / LABEL.summaryLine)));
}
