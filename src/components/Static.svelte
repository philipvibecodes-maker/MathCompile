<script lang="ts">
  import { mountStaticMath } from '../editor/static-math';

  let { latex = '' }: { latex?: string } = $props();
  let el: HTMLSpanElement;
  let sm = $state<ReturnType<typeof mountStaticMath>>();

  $effect(() => {
    if (!sm) sm = mountStaticMath(el);
    sm.set(latex);
  });
</script>

<span bind:this={el}></span>
