import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIMING, cycleLength, elapsedFor, flowState, positionAt, resolveFlow } from './flow.ts';
import { fixture } from './fixture.ts';

test('a flow resolves to one segment per step, following edges in either direction', () => {
  const stack = fixture();
  assert.deepEqual(resolveFlow(stack, stack.flows[0]), [
    { edge: 0, from: 'a', to: 'b', reverse: false },
    { edge: 2, from: 'b', to: 'd', reverse: true },
  ]);
});

test('a step without an edge throws', () => {
  const stack = fixture();
  assert.throws(() => resolveFlow(stack, { id: 'x', label: 'x', steps: ['a', 'c'] }), /no edge joins a and c/);
});

test('flow state lights the steps reached so far', () => {
  const stack = fixture();
  const flow = stack.flows[0];
  const segments = resolveFlow(stack, flow);
  const start = flowState(flow, segments, 0, 0);
  assert.deepEqual([...start.nodes], ['a']);
  assert.equal(start.active, null);
  const moving = flowState(flow, segments, 1, 0.5);
  assert.deepEqual([...moving.nodes], ['a', 'b']);
  assert.deepEqual([...moving.edges].sort(), [0, 2]);
  assert.equal(moving.active?.to, 'd');
  const end = flowState(flow, segments, 2, 0);
  assert.deepEqual([...end.nodes], ['a', 'b', 'd']);
  assert.equal(end.active, null);
});

test('a cursor beyond the flow is clamped', () => {
  const stack = fixture();
  const flow = stack.flows[0];
  const segments = resolveFlow(stack, flow);
  assert.deepEqual([...flowState(flow, segments, 99, 0.5).nodes], ['a', 'b', 'd']);
});

test('the timeline travels, dwells, rests and loops', () => {
  const { travel, dwell } = DEFAULT_TIMING;
  assert.deepEqual(positionAt(0, 2), { cursor: 0, progress: 0 });
  assert.deepEqual(positionAt(travel / 2, 2), { cursor: 0, progress: 0.5 });
  assert.deepEqual(positionAt(travel + 1, 2), { cursor: 1, progress: 0 });
  assert.deepEqual(positionAt(travel + dwell + travel / 4, 2), { cursor: 1, progress: 0.25 });
  assert.deepEqual(positionAt(2 * (travel + dwell) + 1, 2), { cursor: 2, progress: 0 });
  assert.deepEqual(positionAt(cycleLength(2) + travel / 2, 2), { cursor: 0, progress: 0.5 });
});

test('elapsedFor lands on the requested number of finished segments', () => {
  for (const done of [0, 1, 2]) assert.equal(positionAt(elapsedFor(done), 2).cursor, done);
});
