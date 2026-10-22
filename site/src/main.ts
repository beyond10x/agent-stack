import { createApp } from 'vue';
import raw from './generated/agent-stack.json';
import App from './App.vue';
import { validateAgentStack } from './lib/validate.ts';
import './style.css';

const result = validateAgentStack(raw);
createApp(App, result.ok ? { stack: result.stack, errors: [] } : { stack: null, errors: result.errors }).mount('#app');
