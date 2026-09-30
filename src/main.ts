import { mount } from 'svelte';
import './index.css';
import App from './App.svelte';
import { defineMathField } from './editor/math-field';

defineMathField();
mount(App, { target: document.getElementById('root')! });
