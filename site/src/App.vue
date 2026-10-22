<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Explore from './components/Explore.vue';
import Story from './components/Story.vue';
import { layersTopDown } from './lib/graph.ts';
import type { AgentStack } from './lib/types.ts';

const props = defineProps<{ stack: AgentStack | null; errors: string[] }>();

const reducedMotion = ref(false);
const ready = ref(false);
let query: MediaQueryList | null = null;
function onMotion(): void {
  reducedMotion.value = query?.matches ?? false;
}
onMounted(() => {
  query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onMotion);
  onMotion();
  ready.value = true;
});
onBeforeUnmount(() => query?.removeEventListener('change', onMotion));

const strata = computed(() => (props.stack ? layersTopDown(props.stack) : []));
</script>

<template>
  <div class="aurora" aria-hidden="true"></div>
  <div v-if="!stack" class="broken" role="alert">
    <h1>The agent stack</h1>
    <ul><li v-for="error in errors" :key="error"><code>{{ error }}</code></li></ul>
  </div>
  <main v-else-if="ready" class="page" :class="{ 'is-reduced': reducedMotion }">
    <header class="intro">
      <h1>The agent stack</h1>
      <p class="subtitle">One owner per layer, from the model call to the product.</p>
      <ol class="plates" aria-label="Layers, top to bottom">
        <li v-for="(layer, index) in strata" :key="layer.id" :style="{ '--i': index, '--n': strata.length }">{{ layer.name }}</li>
      </ol>
      <span v-if="!reducedMotion" class="cue" aria-hidden="true">Scroll to build it <span>↓</span></span>
    </header>
    <Story v-if="!reducedMotion" :stack="stack" />
    <Explore :stack="stack" :reduced-motion="reducedMotion" />
  </main>
</template>
