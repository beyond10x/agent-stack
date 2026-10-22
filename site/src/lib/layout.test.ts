import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout, summaryLines, type Box } from './layout.ts';
import { validateAgentStack } from './validate.ts';
import { fixture } from './fixture.ts';
import type { AgentStack } from './types.ts';

function realStack(): AgentStack {
  const result = validateAgentStack(JSON.parse(readFileSync(new URL('../generated/agent-stack.json', import.meta.url), 'utf8')));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.stack;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('the dense compact layout is shorter than the plain one', () => {
  const plain = computeLayout(realStack(), { width: 390 });
  const dense = computeLayout(realStack(), { width: 390, dense: true });
  assert.ok(dense.height < plain.height);
});

for (const [width, dense] of [[390, false], [390, true], [1280, false], [1440, false]] as const) {
  test(`no two cards overlap and every card fits at ${width}px${dense ? ', dense' : ''}`, () => {
    const layout = computeLayout(realStack(), { width, minHeight: 600, dense });
    const boxes = [...layout.boxes.values()];
    for (const [i, a] of boxes.entries()) {
      assert.ok(a.x >= 0 && a.x + a.w <= layout.width, `${a.id} fits horizontally`);
      const band = layout.bands[a.band];
      assert.ok(a.y >= band.y && a.y + a.h <= band.y + band.height, `${a.id} sits inside its band`);
      for (const b of boxes.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.id} and ${b.id} overlap`);
    }
  });
}

test('bands run from the highest rank down and tile the height', () => {
  const layout = computeLayout(fixture(), { width: 1280 });
  assert.deepEqual(layout.bands.map((band) => band.layer.id), ['top', 'mid', 'low']);
  let y = 0;
  for (const band of layout.bands) {
    assert.equal(band.y, y);
    y = Math.round((y + band.height) * 10) / 10;
  }
  assert.equal(layout.height, y);
});

test('every node is placed in the band of its layer', () => {
  const stack = realStack();
  const layout = computeLayout(stack, { width: 1280 });
  for (const node of stack.nodes) assert.equal(layout.bands[layout.boxes.get(node.id)!.band].layer.id, node.layer);
});

test('a narrow width switches to the compact layout', () => {
  assert.equal(computeLayout(fixture(), { width: 390 }).compact, true);
  assert.equal(computeLayout(fixture(), { width: 1280 }).compact, false);
});

test('extra height is shared between bands on wide screens', () => {
  const tight = computeLayout(fixture(), { width: 1280 });
  const roomy = computeLayout(fixture(), { width: 1280, minHeight: tight.height + 90 });
  assert.equal(roomy.height, tight.height + 90);
});

test('every edge has a path that starts and ends on its cards', () => {
  const stack = realStack();
  const layout = computeLayout(stack, { width: 1440 });
  assert.equal(layout.edges.length, stack.edges.length);
  for (const path of layout.edges) {
    const edge = stack.edges[path.index];
    const numbers = path.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const [x1, y1] = numbers;
    const [x2, y2] = numbers.slice(-2);
    const a = layout.boxes.get(edge.from)!;
    const b = layout.boxes.get(edge.to)!;
    assert.ok(x1 >= a.x && x1 <= a.x + a.w && (y1 === a.y || y1 === a.y + a.h), `edge ${path.index} starts on ${edge.from}`);
    assert.ok(x2 >= b.x && x2 <= b.x + b.w && (y2 === b.y || y2 === b.y + b.h), `edge ${path.index} ends on ${edge.to}`);
  }
});

test('the layout is deterministic', () => {
  const stack = realStack();
  const first = computeLayout(stack, { width: 1280, minHeight: 640 });
  const second = computeLayout(stack, { width: 1280, minHeight: 640 });
  assert.deepEqual([...first.boxes.entries()], [...second.boxes.entries()]);
  assert.deepEqual(first.edges, second.edges);
});

test('a band summary is clamped to the lines its band has room for', () => {
  const layout = computeLayout(realStack(), { width: 1440, minHeight: 600 });
  for (const band of layout.bands) {
    const lines = summaryLines(band, layout.gutter);
    assert.ok(lines >= 0 && lines <= 3, band.layer.id);
  }
  const roomy = { ...layout.bands[0], height: 400 };
  const tight = { ...layout.bands[0], height: 60 };
  assert.equal(summaryLines(roomy, layout.gutter), 3);
  assert.equal(summaryLines(tight, layout.gutter), 0);
});
