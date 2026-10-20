<script lang="ts">
  // "Copy agent prompt" button — puts the canned custom-functions prompt
  // on the clipboard with the same Copied-flash pattern as the other
  // copy buttons. `label`/`title`/`class` adapt it to each placement.
  import { copyAgentPrompt } from '../agent-prompt';
  let {
    label = 'Agent prompt',
    title = 'Copy a prompt you can paste to an AI agent — it links to the custom-functions doc and asks for the cells to define your function',
    class: cls = '',
  }: { label?: string; title?: string; class?: string } = $props();
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  function copy() {
    void copyAgentPrompt();
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1200);
  }
</script>

<button type="button" class="agent-prompt {cls}" {title} onclick={copy}
  >{copied ? 'Copied' : label}</button
>
