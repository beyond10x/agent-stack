import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { validateAgentStack } from './src/lib/validate.ts';
import { renderNoscript } from './src/lib/noscript.ts';

const dataFile = fileURLToPath(new URL('./src/generated/agent-stack.json', import.meta.url));

function textFallback(): Plugin {
  return {
    name: 'agent-stack-text-fallback',
    transformIndexHtml(html) {
      const result = validateAgentStack(JSON.parse(readFileSync(dataFile, 'utf8')));
      if (!result.ok) throw new Error(`src/generated/agent-stack.json:\n${result.errors.join('\n')}`);
      return html.replace('<!--noscript-->', renderNoscript(result.stack));
    },
  };
}

export default defineConfig({
  base: '/agent-stack/',
  plugins: [vue(), textFallback()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
