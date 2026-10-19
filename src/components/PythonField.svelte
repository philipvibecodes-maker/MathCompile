<script lang="ts">
  import { onMount } from 'svelte';
  import { highlightPython } from '../calc/python-highlight';
  import { pointerRecentlyDown } from '../editor/math-field';
  import type { FieldHandle } from '../editor/attach-field';
  import { appStore, type Cell } from '../state/store.svelte';

  // The python cell editor: a plain textarea over a syntax-highlight
  // underlay (same trick the read-only code blocks use — highlightPython
  // tokens in a <pre>, transparent text + visible caret in the textarea
  // stacked on top). Registered through the same FieldHandle contract as
  // math-field so focus/issue anchors/worksheet nav all behave alike.
  let { cell }: { cell: Cell } = $props();

  let ta: HTMLTextAreaElement;
  let pre: HTMLElement;
  let measCtx: CanvasRenderingContext2D | null = null;

  const autosize = () => {
    // Grow to fit the source — the cell has no inner scroll area.
    if (!ta) return;
    ta.style.height = '0';
    ta.style.height = `${ta.scrollHeight}px`;
  };

  onMount(() => {
    const id = cell.id;

    const onChange = () => appStore.setLatex(id, ta.value);
    const onInput = () => {
      onChange();
      autosize();
    };
    const onScroll = () => {
      // wrap=off horizontal scroll (and any vertical) — keep the
      // highlight underlay aligned with the text.
      pre.scrollLeft = ta.scrollLeft;
      pre.scrollTop = ta.scrollTop;
    };
    const onFocus = () => appStore.noteFocus(id);
    // Same blur-to-nowhere trap as attach-field: Vimium's insert-mode
    // Escape eats the keydown and blurs to nothing — refocus the cell.
    const onFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget !== null || pointerRecentlyDown()) return;
      setTimeout(() => {
        const ae = document.activeElement;
        const stranded = ae === document.body || ae === ta || ae === null;
        if (stranded && appStore.focusedId === id) ta.focus();
      });
    };
    const onFirstLine = () =>
      ta.selectionStart === ta.selectionEnd &&
      !ta.value.slice(0, ta.selectionStart).includes('\n');
    const onLastLine = () =>
      ta.selectionStart === ta.selectionEnd &&
      !ta.value.slice(ta.selectionEnd).includes('\n');
    const onKeydown = (e: KeyboardEvent) => {
      // Shift+Enter mirrors the math cells: new math cell below.
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        appStore.addCell(id);
        return;
      }
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        ta.value.trim() === ''
      ) {
        e.preventDefault();
        appStore.deleteFocused();
        return;
      }
      if (e.key === 'ArrowUp' && !e.shiftKey && onFirstLine()) {
        e.preventDefault();
        appStore.moveOut(id, 'up');
        return;
      }
      if (e.key === 'ArrowDown' && !e.shiftKey && onLastLine()) {
        e.preventDefault();
        appStore.moveOut(id, 'down');
        return;
      }
      // Tab indents two spaces — execCommand keeps the textarea's
      // native undo stack intact.
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (!document.execCommand('insertText', false, '  ')) {
          ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
          onChange();
        }
      }
    };

    const lineAnchors = () => {
      const cs = getComputedStyle(ta);
      const lh =
        parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 19;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      measCtx ??= document.createElement('canvas').getContext('2d');
      if (measCtx)
        measCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const maxRight = ta.clientWidth - padRight;
      return ta.value.split('\n').map((line, i) => ({
        top: padTop + i * lh - ta.scrollTop,
        height: lh,
        right: Math.min(
          padLeft + (measCtx?.measureText(line).width ?? 0),
          maxRight,
        ),
      }));
    };

    const handle: FieldHandle = {
      focus: (edge) => {
        ta.focus();
        const pos = edge === 'start' ? 0 : ta.value.length;
        ta.setSelectionRange(pos, pos);
      },
      getValue: () => ta.value,
      setValue: (v) => {
        if (ta.value !== v) ta.value = v;
        autosize();
      },
      setSmartMode: () => {},
      lineAnchors,
      dispose: () => {
        ta.removeEventListener('input', onInput);
        ta.removeEventListener('scroll', onScroll);
        ta.removeEventListener('focus', onFocus);
        ta.removeEventListener('focusout', onFocusOut);
        ta.removeEventListener('keydown', onKeydown);
      },
    };
    ta.addEventListener('input', onInput);
    ta.addEventListener('scroll', onScroll);
    ta.addEventListener('focus', onFocus);
    ta.addEventListener('focusout', onFocusOut);
    ta.addEventListener('keydown', onKeydown);
    if (cell.latex !== '') ta.value = cell.latex;
    autosize();
    appStore.registerField(id, handle);
    return () => {
      appStore.unregisterField(id);
      handle.dispose();
    };
  });

  // Push external edits (clear, conversion back to math and back) in;
  // the getValue guard breaks the onChange echo like MathField's.
  $effect(() => {
    const v = cell.latex;
    if (ta && ta.value !== v) {
      ta.value = v;
      autosize();
    }
  });
</script>

<div class="py-field" class:empty={cell.latex.trim() === ''}>
  <span
    class="py-tag"
    title="Python cell — defs here are callable in math cells as \mathrm{name}(x)"
    aria-hidden="true">py</span
  >
  <div class="py-stack">
    <pre bind:this={pre} class="py-highlight" aria-hidden="true"><code
        >{#each highlightPython(cell.latex) as tok, i (i)}<span
            class={tok.cls ? `tok-${tok.cls}` : undefined}
            >{tok.text}</span
          >{/each}{' '}</code
      ></pre>
    <textarea
      bind:this={ta}
      class="py-input"
      rows="1"
      wrap="off"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label="Python source — define functions callable from math cells"
    ></textarea>
  </div>
</div>
