import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealOf, scrollProgress, storyFrame, storyUnits } from './scroll.ts';

test('scroll progress runs from 0 at the top of the section to 1 at its end', () => {
  assert.equal(scrollProgress(100, 3000, 900), 0);
  assert.equal(scrollProgress(0, 3000, 900), 0);
  assert.equal(scrollProgress(-1050, 3000, 900), 0.5);
  assert.equal(scrollProgress(-5000, 3000, 900), 1);
});

test('a section no taller than the viewport is all or nothing', () => {
  assert.equal(scrollProgress(10, 800, 900), 0);
  assert.equal(scrollProgress(-1, 800, 900), 1);
});

test('layers assemble first, one unit each, from the bottom', () => {
  const units = storyUnits(7, 6);
  assert.equal(units, 14);
  assert.deepEqual(storyFrame(0, 7, 6), { phase: 'assemble', reveal: 0, layer: 0, cursor: 0, progress: 0 });
  const third = storyFrame(2.5 / units, 7, 6);
  assert.equal(third.phase, 'assemble');
  assert.equal(third.layer, 2);
  assert.ok(Math.abs(third.reveal - 2.5) < 1e-9);
});

test('then the call travels one segment per unit', () => {
  const frame = storyFrame(9.25 / 14, 7, 6);
  assert.equal(frame.phase, 'call');
  assert.equal(frame.reveal, 7);
  assert.equal(frame.cursor, 2);
  assert.ok(Math.abs(frame.progress - 0.25) < 1e-9);
});

test('the end holds the whole call', () => {
  assert.deepEqual(storyFrame(1, 7, 6), { phase: 'rest', reveal: 7, layer: 6, cursor: 6, progress: 0 });
  assert.equal(storyFrame(2, 7, 6).phase, 'rest');
});

test('a layer fades in over half a unit, its cards staggered', () => {
  assert.equal(revealOf(0, 0), 0);
  assert.equal(revealOf(0.25, 0), 0.5);
  assert.equal(revealOf(1, 0), 1);
  assert.equal(revealOf(1.5, 2), 0);
  assert.ok(revealOf(0.5, 0, 0, 3) > revealOf(0.5, 0, 2, 3));
  assert.equal(revealOf(0.85, 0, 2, 3), 1);
});
