import type { AgentStack } from './types.ts';

export function fixture(): AgentStack {
  return {
    schema: 'b10x-agent-stack/v1',
    layers: [
      { id: 'top', rank: 2, name: 'Top', summary: 'The top layer.' },
      { id: 'mid', rank: 1, name: 'Middle', summary: 'The middle layer.' },
      { id: 'low', rank: 0, name: 'Low', summary: 'The low layer.' },
    ],
    nodes: [
      { id: 'a', label: 'A', layer: 'top', kind: 'actor', status: 'active', definition: 'Starts things.', repository: null, github: null, docs: null },
      { id: 'b', label: 'B', layer: 'mid', kind: 'repository', status: 'active', definition: 'Does things.', repository: 'b', github: 'https://github.com/beyond10x/b', docs: '/b/' },
      { id: 'c', label: 'C', layer: 'mid', kind: 'library', status: 'proposed', definition: 'Helps B.', repository: 'b', github: null, docs: null },
      { id: 'd', label: 'D', layer: 'low', kind: 'provider', status: 'paused', definition: 'Answers.', repository: null, github: null, docs: null },
    ],
    edges: [
      { from: 'a', to: 'b', kind: 'drives', label: 'asks' },
      { from: 'b', to: 'c', kind: 'contains', label: 'ships' },
      { from: 'd', to: 'b', kind: 'calls', label: 'answers' },
    ],
    flows: [{ id: 'main', label: 'A to D', steps: ['a', 'b', 'd'] }],
  };
}
