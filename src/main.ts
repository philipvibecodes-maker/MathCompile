import { mount } from 'svelte';
import './index.css';
import App from './App.svelte';
import {
  defineMathField,
  resetLastPointerDown,
} from './editor/math-field';
import { appStore } from './state/store.svelte';
import { flushPendingCells } from './state/persistence';
import { DEFAULT_HELP_IDS } from './help/topics';

defineMathField();
mount(App, { target: document.getElementById('root')! });

// e2e hook: lets a shared Playwright page reset the store between tests
// without a reload. Dev server always; prod builds only when the e2e
// preview build opts in with VITE_E2E_HOOK=1 (playwright.config.ts).
if (import.meta.env.DEV || import.meta.env.VITE_E2E_HOOK) {
  (window as unknown as Record<string, unknown>).__mc = {
    store: appStore,
    flushPendingCells,
    DEFAULT_HELP_IDS,
    resetLastPointerDown,
  };
}
