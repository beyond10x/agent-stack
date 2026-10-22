import type { AgentStack } from './types.ts';
import { layersTopDown } from './graph.ts';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderNoscript(stack: AgentStack): string {
  const lines: string[] = ['<noscript>', '<section class="fallback" aria-label="The agent stack as text">', '<ol>'];
  for (const layer of layersTopDown(stack)) {
    lines.push(`<li><strong>${escapeHtml(layer.name)}</strong>: ${escapeHtml(layer.summary)}`);
    const nodes = stack.nodes.filter((node) => node.layer === layer.id);
    if (nodes.length > 0) {
      lines.push('<ul>');
      for (const node of nodes) {
        const status = node.status === 'active' ? '' : ` (${node.status})`;
        lines.push(`<li>${escapeHtml(node.label)}${escapeHtml(status)}: ${escapeHtml(node.definition)}</li>`);
      }
      lines.push('</ul>');
    }
    lines.push('</li>');
  }
  lines.push('</ol>', '</section>', '</noscript>');
  return lines.join('\n');
}
