<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import type { Link } from '../lib/graph.ts';
import type { Layer, StackNode } from '../lib/types.ts';

const props = defineProps<{
  node: StackNode;
  layer: Layer;
  incoming: Link[];
  outgoing: Link[];
  hue: number;
}>();
const emit = defineEmits<{ close: []; select: [id: string] }>();

const closer = ref<HTMLButtonElement | null>(null);
onMounted(() => closer.value?.focus());
watch(
  () => props.node.id,
  async () => {
    await nextTick();
    closer.value?.focus();
  },
);
</script>

<template>
  <aside class="panel" :aria-label="node.label" :style="{ '--hue': hue }">
    <button ref="closer" type="button" class="panel-close" aria-label="Close" @click="emit('close')">×</button>
    <p class="panel-layer">{{ layer.name }} <span class="band-id">{{ layer.id }}</span></p>
    <h3 class="panel-title">{{ node.label }}</h3>
    <p class="panel-meta">
      <span class="chip">{{ node.kind }}</span>
      <span v-if="node.status !== 'active'" :class="['badge', `status-${node.status}`]">{{ node.status }}</span>
    </p>
    <p class="panel-definition">{{ node.definition }}</p>
    <p v-if="node.github || node.docs" class="panel-links">
      <a v-if="node.docs" :href="node.docs">{{ node.docs }}</a>
      <a v-if="node.github" :href="node.github">{{ node.github.replace('https://', '') }}</a>
    </p>
    <div v-if="incoming.length" class="panel-group">
      <h4 aria-label="incoming"><span aria-hidden="true">→●</span> {{ incoming.length }}</h4>
      <ul>
        <li v-for="link in incoming" :key="link.index">
          <button type="button" class="panel-edge" @click="emit('select', link.peer.id)">
            <strong>{{ link.peer.label }}</strong> <span class="edge-kind">{{ link.edge.kind }}</span>
            <span class="edge-label">{{ link.edge.label }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div v-if="outgoing.length" class="panel-group">
      <h4 aria-label="outgoing"><span aria-hidden="true">●→</span> {{ outgoing.length }}</h4>
      <ul>
        <li v-for="link in outgoing" :key="link.index">
          <button type="button" class="panel-edge" @click="emit('select', link.peer.id)">
            <strong>{{ link.peer.label }}</strong> <span class="edge-kind">{{ link.edge.kind }}</span>
            <span class="edge-label">{{ link.edge.label }}</span>
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>
