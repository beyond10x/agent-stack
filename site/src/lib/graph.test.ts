import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layersTopDown, links, neighbourhood, nodesInReadingOrder } from './graph.ts';
import { fixture } from './fixture.ts';

test('the neighbourhood of a node holds it, its peers and its edges', () => {
  const near = neighbourhood(fixture(), 'b');
  assert.deepEqual([...near.nodes].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...near.edges].sort(), [0, 1, 2]);
});

test('a leaf has one peer', () => {
  const near = neighbourhood(fixture(), 'c');
  assert.deepEqual([...near.nodes].sort(), ['b', 'c']);
  assert.deepEqual([...near.edges], [1]);
});

test('links split incoming from outgoing and name the peer', () => {
  const { incoming, outgoing } = links(fixture(), 'b');
  assert.deepEqual(incoming.map((link) => link.peer.id), ['a', 'd']);
  assert.deepEqual(outgoing.map((link) => link.peer.id), ['c']);
});

test('layers read from the highest rank down', () => {
  assert.deepEqual(layersTopDown(fixture()).map((layer) => layer.id), ['top', 'mid', 'low']);
});

test('reading order follows layers, then source order', () => {
  const stack = fixture();
  stack.nodes.reverse();
  assert.deepEqual(nodesInReadingOrder(stack).map((node) => node.id), ['a', 'c', 'b', 'd']);
});
