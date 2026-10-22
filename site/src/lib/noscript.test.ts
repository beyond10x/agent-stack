import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderNoscript } from './noscript.ts';
import { fixture } from './fixture.ts';

test('the text fallback lists every layer top down and every node with its status', () => {
  const html = renderNoscript(fixture());
  assert.ok(html.startsWith('<noscript>') && html.endsWith('</noscript>'));
  assert.ok(html.indexOf('Top') < html.indexOf('Middle') && html.indexOf('Middle') < html.indexOf('Low'));
  assert.match(html, /C \(proposed\): Helps B\./);
  assert.match(html, /D \(paused\): Answers\./);
  assert.doesNotMatch(html, /<a /);
});

test('text is escaped', () => {
  assert.equal(escapeHtml(`<b> & "x" 'y'`), '&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39;');
  const stack = fixture();
  stack.nodes[0].definition = '<script>alert(1)</script>';
  assert.doesNotMatch(renderNoscript(stack), /<script>/);
});
