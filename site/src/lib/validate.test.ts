import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAgentStack } from './validate.ts';
import { fixture } from './fixture.ts';

function errorsOf(input: unknown): string[] {
  const result = validateAgentStack(input);
  return result.ok ? [] : result.errors;
}

test('the committed data file satisfies the contract', () => {
  const raw = JSON.parse(readFileSync(new URL('../generated/agent-stack.json', import.meta.url), 'utf8'));
  assert.deepEqual(errorsOf(raw), []);
});

test('a valid document passes and is returned', () => {
  const result = validateAgentStack(fixture());
  assert.equal(result.ok, true);
});

test('a wrong schema is refused', () => {
  assert.match(errorsOf({ ...fixture(), schema: 'b10x-agent-stack/v2' }).join('\n'), /schema must be/);
});

test('a node on an unknown layer is refused', () => {
  const stack = fixture();
  stack.nodes[0].layer = 'nowhere';
  assert.match(errorsOf(stack).join('\n'), /layer "nowhere" is not a layer id/);
});

test('an edge to an unknown node is refused', () => {
  const stack = fixture();
  stack.edges[0].to = 'ghost';
  assert.match(errorsOf(stack).join('\n'), /to "ghost" is not a node id/);
});

test('consecutive flow steps without an edge are refused', () => {
  const stack = fixture();
  stack.flows[0].steps = ['a', 'c'];
  assert.match(errorsOf(stack).join('\n'), /"a" and "c" are not joined/);
});

test('a flow step may follow an edge against its direction', () => {
  const stack = fixture();
  stack.flows[0].steps = ['b', 'a'];
  assert.deepEqual(errorsOf(stack), []);
});

test('duplicate ids and ranks are refused', () => {
  const stack = fixture();
  stack.nodes[1].id = 'a';
  stack.layers[1].rank = 2;
  const errors = errorsOf(stack).join('\n');
  assert.match(errors, /duplicate id "a"/);
  assert.match(errors, /duplicate rank 2/);
});

test('a long or multi-line definition is refused', () => {
  const stack = fixture();
  stack.nodes[0].definition = 'x'.repeat(161);
  stack.nodes[1].definition = 'one\ntwo';
  const errors = errorsOf(stack).join('\n');
  assert.match(errors, /nodes\[0\]: definition exceeds 160/);
  assert.match(errors, /nodes\[1\]: definition must be one line/);
});

test('links outside the admitted shapes are refused', () => {
  const stack = fixture();
  stack.nodes[1].github = 'https://example.com/b';
  stack.nodes[1].docs = 'https://example.com/b/';
  const errors = errorsOf(stack).join('\n');
  assert.match(errors, /github must be null/);
  assert.match(errors, /docs must be null or a site-relative route/);
});

test('a protocol-relative docs route is refused', () => {
  const stack = fixture();
  stack.nodes[1].docs = '//evil.example/';
  assert.match(errorsOf(stack).join('\n'), /docs must be null/);
});

test('unknown and missing keys are refused', () => {
  const stack = fixture() as unknown as { nodes: Record<string, unknown>[] };
  stack.nodes[0].colour = 'red';
  delete stack.nodes[0].docs;
  const errors = errorsOf(stack).join('\n');
  assert.match(errors, /unknown "colour"/);
  assert.match(errors, /missing "docs"/);
});

test('an unknown enum value is refused', () => {
  const stack = fixture() as unknown as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
  stack.nodes[0].status = 'retired';
  stack.edges[0].kind = 'loves';
  const errors = errorsOf(stack).join('\n');
  assert.match(errors, /status "retired"/);
  assert.match(errors, /kind "loves"/);
});

test('a non-object is refused', () => {
  assert.deepEqual(errorsOf(null), ['document must be an object']);
  assert.deepEqual(errorsOf([]), ['document must be an object']);
});
