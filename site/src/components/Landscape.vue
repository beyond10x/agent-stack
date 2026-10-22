<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watchEffect } from 'vue';
import type { Segment } from '../lib/flow.ts';
import type { Neighbourhood } from '../lib/graph.ts';
import { computeLayout, summaryLines } from '../lib/layout.ts';
import { revealOf } from '../lib/scroll.ts';
import type { AgentStack, StackNode } from '../lib/types.ts';

const props = withDefaults(
  defineProps<{
    stack: AgentStack;
    flowNodes?: Set<string> | null;
    flowEdges?: Set<number> | null;
    active?: Segment | null;
    progress?: number;
    highlight?: Neighbourhood | null;
    focusId?: string | null;
    selectedId?: string | null;
    animate?: boolean;
    interactive?: boolean;
    reveal?: number | null;
    currentLayer?: number | null;
    dense?: boolean;
    fitHeight?: number | null;
    fillHeight?: number | null;
  }>(),
  {
    flowNodes: null,
    flowEdges: null,
    active: null,
    progress: 0,
    highlight: null,
    focusId: null,
    selectedId: null,
    animate: true,
    interactive: true,
    reveal: null,
    currentLayer: null,
    dense: false,
    fitHeight: null,
    fillHeight: null,
  },
);

const emit = defineEmits<{ hover: [id: string | null]; select: [id: string] }>();

const uid = useId();
const root = ref<HTMLElement | null>(null);
const width = ref(1280);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!root.value) return;
  width.value = root.value.clientWidth;
  observer = new ResizeObserver(() => {
    if (root.value) width.value = root.value.clientWidth;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const layout = computed(() =>
  computeLayout(props.stack, { width: width.value, minHeight: props.fillHeight ?? undefined, dense: props.dense }),
);
const scale = computed(() => (props.fitHeight && layout.value.height > props.fitHeight ? props.fitHeight / layout.value.height : 1));
const layerCount = computed(() => layout.value.bands.length);

function hue(bandIndex: number): number {
  const n = layerCount.value;
  return Math.round(28 + (n > 1 ? (bandIndex / (n - 1)) * 236 : 0));
}

const nodeOrder = computed(() =>
  [...layout.value.boxes.values()].sort((a, b) => a.band - b.band || a.y - b.y || a.x - b.x),
);
const nodeById = computed(() => new Map(props.stack.nodes.map((node) => [node.id, node])));
const slotOf = computed(() => {
  const slots = new Map<string, { slot: number; count: number }>();
  for (const band of layout.value.bands) {
    const members = nodeOrder.value.filter((box) => box.band === band.index);
    members.forEach((box, slot) => slots.set(box.id, { slot, count: members.length }));
  }
  return slots;
});

function fromBottom(bandIndex: number): number {
  return layerCount.value - 1 - bandIndex;
}
function bandReveal(bandIndex: number): number {
  return props.reveal === null ? 1 : revealOf(props.reveal, fromBottom(bandIndex));
}
function nodeReveal(id: string): number {
  if (props.reveal === null) return 1;
  const box = layout.value.boxes.get(id)!;
  const { slot, count } = slotOf.value.get(id)!;
  return revealOf(props.reveal, fromBottom(box.band), slot, count);
}
function edgeReveal(index: number): number {
  const edge = props.stack.edges[index];
  return Math.min(nodeReveal(edge.from), nodeReveal(edge.to));
}

function nodeClass(node: StackNode): Record<string, boolean> {
  const id = node.id;
  return {
    [`status-${node.status}`]: true,
    [`kind-${node.kind}`]: true,
    lit: !!props.flowNodes?.has(id),
    target: props.active?.to === id && props.progress > 0,
    near: !!props.highlight?.nodes.has(id),
    dim: !!props.highlight && !props.highlight.nodes.has(id),
    focus: props.focusId === id,
    selected: props.selectedId === id,
  };
}
function edgeState(index: number): 'hot' | 'lit' | 'dim' | 'rest' {
  if (props.highlight) return props.highlight.edges.has(index) ? 'hot' : 'dim';
  if (props.flowEdges?.has(index) && props.active?.edge !== index) return 'lit';
  return 'rest';
}

const pathEls = new Map<number, SVGPathElement>();
function bindPath(index: number, el: unknown): void {
  if (el instanceof SVGPathElement) pathEls.set(index, el);
  else pathEls.delete(index);
}

const pulses = ref<{ x: number; y: number; r: number; o: number }[]>([]);
watchEffect(
  () => {
    const active = props.active;
    const progress = props.progress;
    void layout.value;
    const el = active ? pathEls.get(active.edge) : undefined;
    if (!active || !el || progress <= 0) {
      pulses.value = [];
      return;
    }
    const length = el.getTotalLength();
    const out: { x: number; y: number; r: number; o: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const t = progress - k * 0.03;
      if (t < 0) break;
      const point = el.getPointAtLength(length * (active.reverse ? 1 - t : t));
      out.push({ x: point.x, y: point.y, r: 6 - k * 0.8, o: 1 - k * 0.16 });
    }
    pulses.value = out;
  },
  { flush: 'post' },
);

function travelStyle(index: number): Record<string, string> {
  if (!props.active || props.active.edge !== index) return {};
  const p = Math.max(0, Math.min(1, props.progress));
  return { strokeDashoffset: String(props.active.reverse ? -(1 - p) : 1 - p) };
}

function markerFor(state: string): string {
  return `url(#${uid}-arrow-${state})`;
}
</script>

<template>
  <div
    ref="root"
    class="landscape"
    :class="{ compact: layout.compact, interactive, ambient: animate, revealing: reveal !== null }"
    :style="{ height: `${layout.height * scale}px` }"
    :aria-hidden="interactive ? undefined : 'true'"
  >
    <div
      class="canvas"
      :style="{
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        transform: scale < 1 ? `translateX(${(layout.width * (1 - scale)) / 2}px) scale(${scale})` : undefined,
      }"
    >
      <div
        v-for="band in layout.bands"
        :key="band.layer.id"
        class="band"
        :class="{ current: currentLayer === fromBottom(band.index) }"
        :style="{
          top: `${band.y}px`,
          height: `${band.height}px`,
          '--hue': hue(band.index),
          opacity: bandReveal(band.index),
          transform: reveal === null ? undefined : `translateY(${(1 - bandReveal(band.index)) * 24}px)`,
        }"
      >
        <div class="band-label" :style="{ width: layout.compact ? '100%' : `${layout.gutter}px` }">
          <component :is="interactive ? 'h2' : 'div'" class="band-name">
            {{ band.layer.name }}<span class="band-id">{{ band.layer.id }}</span>
          </component>
          <p v-if="layout.compact || summaryLines(band, layout.gutter) > 0" class="band-summary" :style="layout.compact ? undefined : { '-webkit-line-clamp': summaryLines(band, layout.gutter) }">{{ band.layer.summary }}</p>
        </div>
      </div>

      <svg class="edges" :width="layout.width" :height="layout.height" :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
        <defs>
          <marker v-for="state in ['rest', 'lit', 'hot', 'dim']" :id="`${uid}-arrow-${state}`" :key="state" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9 z" :class="`arrow arrow-${state}`" />
          </marker>
          <filter :id="`${uid}-glow`" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g v-for="path in layout.edges" :key="path.index" :style="{ opacity: edgeReveal(path.index) }">
          <path :ref="(el) => bindPath(path.index, el)" :d="path.d" :class="['edge-line', `kind-${stack.edges[path.index].kind}`, `state-${edgeState(path.index)}`]" :marker-end="markerFor(edgeState(path.index))" />
          <path v-if="animate && edgeState(path.index) !== 'dim'" :d="path.d" class="edge-ambient" />
          <path v-if="active && active.edge === path.index" :d="path.d" class="edge-travel" pathLength="1" :style="travelStyle(path.index)" :filter="`url(#${uid}-glow)`" />
        </g>
        <circle v-for="(pulse, index) in pulses" :key="index" :cx="pulse.x" :cy="pulse.y" :r="pulse.r" :opacity="pulse.o" class="pulse" :filter="index === 0 ? `url(#${uid}-glow)` : undefined" />
      </svg>

      <template v-for="box in nodeOrder" :key="box.id">
        <component
          :is="interactive ? 'button' : 'div'"
          :type="interactive ? 'button' : undefined"
          class="card"
          :class="nodeClass(nodeById.get(box.id)!)"
          :data-node="interactive ? box.id : undefined"
          :aria-label="interactive ? `${nodeById.get(box.id)!.label}, ${nodeById.get(box.id)!.kind}, ${nodeById.get(box.id)!.status}` : undefined"
          :aria-pressed="interactive ? selectedId === box.id : undefined"
          :style="{
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${box.w}px`,
            height: `${box.h}px`,
            '--hue': hue(box.band),
            opacity: reveal === null ? undefined : nodeReveal(box.id),
            transform: reveal === null ? undefined : `translateY(${(1 - nodeReveal(box.id)) * 18}px) scale(${0.92 + 0.08 * nodeReveal(box.id)})`,
          }"
          @mouseenter="interactive && emit('hover', box.id)"
          @mouseleave="interactive && emit('hover', null)"
          @focus="interactive && emit('hover', box.id)"
          @blur="interactive && emit('hover', null)"
          @click="interactive && emit('select', box.id)"
        >
          <span class="card-label">{{ nodeById.get(box.id)!.label }}</span>
          <span class="card-meta">
            <span>{{ nodeById.get(box.id)!.kind }}</span>
            <span v-if="nodeById.get(box.id)!.status !== 'active'" :class="['badge', `status-${nodeById.get(box.id)!.status}`]">{{ nodeById.get(box.id)!.status }}</span>
          </span>
        </component>
      </template>
    </div>
  </div>
</template>
