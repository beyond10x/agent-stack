<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Landscape from './Landscape.vue';
import { flowState, resolveFlow } from '../lib/flow.ts';
import { layersTopDown } from '../lib/graph.ts';
import { scrollProgress, storyFrame, storyUnits } from '../lib/scroll.ts';
import type { AgentStack } from '../lib/types.ts';

const props = defineProps<{ stack: AgentStack }>();

const flow = computed(() => props.stack.flows[0] ?? null);
const segments = computed(() => (flow.value ? resolveFlow(props.stack, flow.value) : []));
const bottomUp = computed(() => [...layersTopDown(props.stack)].reverse());
const units = computed(() => storyUnits(props.stack.layers.length, segments.value.length));

const section = ref<HTMLElement | null>(null);
const progress = ref(0);
const viewport = ref(900);
const width = ref(1280);

const frame = computed(() => storyFrame(progress.value, props.stack.layers.length, segments.value.length));
const state = computed(() =>
  flow.value && frame.value.phase !== 'assemble'
    ? flowState(flow.value, segments.value, frame.value.cursor, frame.value.progress)
    : null,
);
const nodeById = computed(() => new Map(props.stack.nodes.map((node) => [node.id, node])));
const currentLayer = computed(() => bottomUp.value[frame.value.layer]);
const segment = computed(() => {
  if (frame.value.phase !== 'call') return null;
  const value = segments.value[frame.value.cursor];
  return value ? { value, edge: props.stack.edges[value.edge] } : null;
});
const compact = computed(() => width.value < 720);

let pending = 0;
function measure(): void {
  pending = 0;
  if (!section.value) return;
  const rect = section.value.getBoundingClientRect();
  viewport.value = window.innerHeight;
  width.value = window.innerWidth;
  progress.value = scrollProgress(rect.top, rect.height, window.innerHeight);
}
function schedule(): void {
  if (!pending) pending = requestAnimationFrame(measure);
}
onMounted(() => {
  measure();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(pending);
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
});
</script>

<template>
  <section ref="section" class="story" :style="{ height: `${units * 75 + 100}vh` }">
    <div class="stage">
      <div class="stage-caption" :class="{ compact }" aria-live="off">
        <template v-if="frame.phase === 'assemble' && currentLayer">
          <h2 :key="currentLayer.id" class="stage-heading">{{ currentLayer.name }}</h2>
          <p :key="`${currentLayer.id}-summary`" class="stage-text">{{ currentLayer.summary }}</p>
        </template>
        <template v-else-if="flow">
          <p class="stage-flow">{{ flow.label }}</p>
          <p v-if="segment" :key="segment.value.edge" class="stage-text">
            <strong>{{ nodeById.get(segment.value.from)?.label }}</strong>
            {{ segment.value.reverse ? '⇠' : '→' }}
            <strong>{{ nodeById.get(segment.value.to)?.label }}</strong>
            · {{ segment.edge.label }}
          </p>
        </template>
      </div>
      <Landscape
        class="stage-landscape"
        :stack="stack"
        :interactive="false"
        :reveal="frame.reveal"
        :current-layer="frame.phase === 'assemble' ? frame.layer : null"
        :flow-nodes="state?.nodes ?? null"
        :flow-edges="state?.edges ?? null"
        :active="state?.active ?? null"
        :progress="frame.progress"
        :dense="true"
        :fit-height="viewport - (compact ? 150 : 120)"
        :fill-height="viewport - 120"
      />
      <div class="stage-meter" aria-hidden="true"><span :style="{ transform: `scaleX(${progress})` }"></span></div>
    </div>
  </section>
</template>
