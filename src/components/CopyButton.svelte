<script lang="ts">
  // Small Copy button for issue messages — the same Copied-flash
  // pattern as the code/LaTeX copy buttons, shared so each error or
  // note can carry its own.
  let { text, class: cls = '' }: { text: string; class?: string } =
    $props();
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  function copy() {
    // A denied copy rejects the promise — swallow it.
    navigator.clipboard.writeText(text).catch(() => {});
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1200);
  }
</script>

<button
  type="button"
  class="issue-copy {cls}"
  title="Copy this message"
  onclick={copy}>{copied ? 'Copied' : 'Copy'}</button
>
