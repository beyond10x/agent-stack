<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Landscape from './Landscape.vue';
import NodePanel from './NodePanel.vue';
import { DEFAULT_TIMING, elapsedFor, flowState, positionAt, resolveFlow } from '../lib/flow.ts';
import { layersTopDown, links, neighbourhood } from '../lib/graph.ts';
import { EDGE_KINDS, type AgentStack } from '../lib/types.ts';

const props = defineProps<{ stack: AgentStack; reducedMotion: boolean }>();

const flowId = ref(props.stack.flows[0]?.id ?? '');
const flow = computed(() => props.stack.flows.find((candidate) => candidate.id === flowId.value) ?? null);
const segments = computed(() => (flow.value ? resolveFlow(props.stack, flow.value) : []));

const playing = ref(false);
const elapsed = ref(0);
const manual = ref(false);
const hoverId = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const section = ref<HTMLElement | null>(null);
const viewport = ref(900);

const position = computed(() => {
  if (props.reducedMotion && !manual.value) return { cursor: segments.value.length, progress: 0 };
  return positionAt(elapsed.value, segments.value.length, DEFAULT_TIMING);
});
const state = computed(() => (flow.value ? flowState(flow.value, segments.value, position.value.cursor, position.value.progress) : null));
const focusId = computed(() => hoverId.value ?? selectedId.value);
const highlight = computed(() => (focusId.value ? neighbourhood(props.stack, focusId.value) : null));

const nodeById = computed(() => new Map(props.stack.nodes.map((node) => [node.id, node])));
const bandOf = computed(() => new Map(layersTopDown(props.stack).map((layer, index) => [layer.id, index])));
const selected = computed(() => (selectedId.value ? nodeById.value.get(selectedId.value) ?? null : null));
const selectedLayer = computed(() => props.stack.layers.find((layer) => layer.id === selected.value?.layer) ?? null);
const selectedLinks = computed(() => (selected.value ? links(props.stack, selected.value.id) : null));
const edgeKinds = computed(() => EDGE_KINDS.filter((kind) => props.stack.edges.some((edge) => edge.kind === kind)));
const statuses = computed(() => (['proposed', 'paused'] as const).filter((status) => props.stack.nodes.some((node) => node.status === status)));

function hueOf(layerId: string): number {
  const n = props.stack.layers.length;
  const index = bandOf.value.get(layerId) ?? 0;
  return Math.round(28 + (n > 1 ? (index / (n - 1)) * 236 : 0));
}

const caption = computed(() => {
  if (!flow.value) return '';
  const { cursor, progress } = position.value;
  const index = progress > 0 ? cursor : cursor - 1;
  if (index < 0) return nodeById.value.get(flow.value.steps[0])?.label ?? '';
  const segment = segments.value[Math.min(index, segments.value.length - 1)];
  const edge = props.stack.edges[segment.edge];
  const from = nodeById.value.get(segment.from)?.label ?? segment.from;
  const to = nodeById.value.get(segment.to)?.label ?? segment.to;
  return `${from} ${segment.reverse ? '⇠' : '→'} ${to} · ${edge.label}`;
});

let frame = 0;
let last = 0;
function tick(now: number): void {
  if (!playing.value) return;
  if (last) elapsed.value += Math.min(now - last, 100);
  last = now;
  frame = requestAnimationFrame(tick);
}
function play(): void {
  if (playing.value || segments.value.length === 0) return;
  manual.value = true;
  playing.value = true;
  last = 0;
  frame = requestAnimationFrame(tick);
}
function pause(): void {
  playing.value = false;
  cancelAnimationFrame(frame);
}
function toggle(): void {
  if (playing.value) pause();
  else play();
}
function step(delta: number): void {
  const current = position.value.cursor + (position.value.progress > 0 && delta > 0 ? 1 : 0);
  pause();
  manual.value = true;
  elapsed.value = elapsedFor(Math.max(0, Math.min(segments.value.length, current + delta)), DEFAULT_TIMING);
}

watch(flowId, () => {
  elapsed.value = 0;
});

async function close(): Promise<void> {
  const id = selectedId.value;
  selectedId.value = null;
  await nextTick();
  if (id) section.value?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.focus();
}
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (selectedId.value) void close();
  else hoverId.value = null;
}
function onResize(): void {
  viewport.value = window.innerHeight;
}

let visibility: IntersectionObserver | null = null;
onMounted(() => {
  onResize();
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize, { passive: true });
  if (props.reducedMotion || !section.value) return;
  visibility = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
        if (!manual.value) play();
      } else if (playing.value) {
        pause();
        manual.value = false;
      }
    },
    { threshold: [0, 0.4, 0.8] },
  );
  visibility.observe(section.value);
});
onBeforeUnmount(() => {
  pause();
  visibility?.disconnect();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <section ref="section" class="explore" aria-label="The agent stack, interactive">
    <div class="toolbar" role="group" aria-label="Flow">
      <select v-model="flowId" aria-label="Flow">
        <option v-for="option in stack.flows" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
      <div class="buttons">
        <button type="button" class="icon" aria-label="Previous step" @click="step(-1)">‹</button>
        <button type="button" class="icon play" :aria-label="playing ? 'Pause' : 'Play'" :aria-pressed="playing" @click="toggle">
          <span aria-hidden="true">{{ playing ? '❚❚' : '▶\uFE0E' }}</span>
        </button>
        <button type="button" class="icon" aria-label="Next step" @click="step(1)">›</button>
      </div>
      <p class="caption" :aria-live="playing ? 'off' : 'polite'">{{ caption }}</p>
    </div>
    <Landscape
      :stack="stack"
      :flow-nodes="state?.nodes ?? null"
      :flow-edges="state?.edges ?? null"
      :active="state?.active ?? null"
      :progress="position.progress"
      :highlight="highlight"
      :focus-id="focusId"
      :selected-id="selectedId"
      :animate="!reducedMotion"
      :fill-height="viewport - 150"
      @hover="hoverId = $event"
      @select="selectedId = $event"
    />
    <footer class="legend" aria-label="Legend">
      <span v-for="kind in edgeKinds" :key="kind" class="legend-item">
        <svg width="34" height="10" aria-hidden="true"><line x1="1" y1="5" x2="33" y2="5" :class="['edge-line', `kind-${kind}`, 'state-rest']" /></svg>{{ kind }}
      </span>
      <span v-for="status in statuses" :key="status" class="legend-item"><span :class="['badge', `status-${status}`]">{{ status }}</span></span>
      <a class="legend-link" href="https://beyond10x.github.io/architecture/#agent-stack">beyond10x.github.io/architecture</a>
    </footer>
    <NodePanel
      v-if="selected && selectedLayer && selectedLinks"
      :node="selected"
      :layer="selectedLayer"
      :incoming="selectedLinks.incoming"
      :outgoing="selectedLinks.outgoing"
      :hue="hueOf(selected.layer)"
      @close="close"
      @select="selectedId = $event"
    />
  </section>
</template>
