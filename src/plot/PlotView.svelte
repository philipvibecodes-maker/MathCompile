<script lang="ts">
  // Renders one `\text{plot}` row's sampled payload. plotly.js (~1MB
  // min) is dynamically imported on first mount so worksheets without
  // plots never pay for it; `Plotly.react` re-diffs on every payload
  // change so edits re-render the figure in place.
  import { onMount } from 'svelte';
  import type PlotlyT from 'plotly.js-dist-min';
  import { appStore } from '../state/store.svelte';
  import type { PlotData } from './types';
  import { applyModeAxes, GL3D_TYPES, themedFigure } from './theme';

  let { plot }: { plot: PlotData } = $props();

  let el = $state<HTMLDivElement | undefined>();
  let Plotly = $state<typeof PlotlyT | undefined>();
  let failed = $state('');

  // Plot height and width, adjustable by dragging the bottom and
  // right-edge grips. Width is capped by the row's available space.
  let height = $state(360);
  let width = $state(780);
  const MIN_H = 160;
  const MAX_H = 1200;
  const MIN_W = 240;

  function onGripDown(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => {
      height = Math.min(MAX_H, Math.max(MIN_H, startH + ev.clientY - startY));
      // Live-resize without waiting for a themed re-render —
      // Plotly.react picks the size up on the next render anyway.
      if (el && Plotly) Plotly.Plots.resize(el);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onSideGripDown(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    // The row is the clamp — the css max-width keeps the box inside it.
    const maxW = el?.parentElement?.parentElement?.clientWidth ?? 1200;
    const move = (ev: PointerEvent) => {
      width = Math.min(maxW, Math.max(MIN_W, startW + ev.clientX - startX));
      if (el && Plotly) Plotly.Plots.resize(el);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const CONFIG = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['toImage'],
    scrollZoom: true,
    doubleClick: 'reset',
    // gl3d has no MSAA — supersample the GL canvas (default 2) so
    // scene edges and gridlines don't stair-step.
    plotGlPixelRatio: 4,
  };

  // Debug aid — live camera-zoom readout for 3-D scenes (tear out when
  // done tuning the camera work). Zoom is eye↔center distance relative
  // to the worker's initial camera: 1.00× = the shipped framing.
  interface V3 {
    x: number;
    y: number;
    z: number;
  }
  interface SceneCam {
    eye?: V3;
    center?: V3;
    up?: V3;
  }
  let zoomText = $state('');
  let baseEye = 0;
  function sceneCam(gd: HTMLDivElement): SceneCam | null {
    const lay = (gd as unknown as { layout?: Record<string, unknown> })
      .layout;
    for (const key of Object.keys(lay ?? {})) {
      if (!/^scene\d*$/.test(key)) continue;
      const cam = (lay![key] as { camera?: SceneCam })?.camera;
      if (cam?.eye) return cam;
    }
    return null;
  }
  function eyeDist(cam: SceneCam): number {
    const e = cam.eye!;
    const c = cam.center ?? { x: 0, y: 0, z: 0 };
    return Math.hypot(e.x - c.x, e.y - c.y, e.z - c.z);
  }
  function updateZoom(gd: HTMLDivElement) {
    const cam = sceneCam(gd);
    zoomText = cam
      ? `zoom ${(baseEye ? baseEye / eyeDist(cam) : 1).toFixed(2)}×`
      : '';
  }

  // Zoom-to-cursor for gl3d scenes. Plotly's own wheel handler dollies
  // the eye toward a `center` pinned in place, so after deep zoom the
  // orbit pivot sits far from whatever is in view and pan (whose step
  // scales with eye↔center distance) crawls. Intercepting the wheel in
  // the capture phase lets us dolly toward the cursor instead: the eye
  // moves a fixed fraction toward the cursor's projection onto the
  // pivot plane (the plane through `center` facing the camera), and
  // `center` slides the same fraction — successive notches park the
  // pivot on the feature under the pointer, which keeps orbit and pan
  // meaningful at any zoom. fovy = PI/4 is gl3d's fixed projection.
  const ZOOM_STEP = 0.9; // per 120 deltaY units, same feel as plotly
  const TAN_HALF_FOVY = Math.tan(Math.PI / 8);
  function onSceneWheel(e: WheelEvent) {
    if (!Plotly || !el) return;
    const cam = sceneCam(el);
    if (!cam) return; // 2-D plot — let plotly's own zoom have it
    // Heatmap-style modes keep `layout.scene` but render cartesian —
    // don't hijack the wheel unless a gl3d trace is actually visible.
    const data = (
      el as unknown as { data?: { type?: string; visible?: unknown }[] }
    ).data;
    const glVisible = data?.some(
      (t) =>
        t.type &&
        GL3D_TYPES.has(t.type) &&
        t.visible !== false &&
        t.visible !== 'legendonly',
    );
    if (!glVisible || (!e.deltaY && !e.deltaX)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.deltaY) return; // horizontal wheel — swallowed, no zoom
    const eye = cam.eye!;
    const center = cam.center ?? { x: 0, y: 0, z: 0 };
    const up = cam.up ?? { x: 0, y: 0, z: 1 };
    const dist = eyeDist(cam);
    if (dist < 1e-6) return;
    // Camera basis: forward eye→center, right = forward×up.
    const fwd = {
      x: (center.x - eye.x) / dist,
      y: (center.y - eye.y) / dist,
      z: (center.z - eye.z) / dist,
    };
    const cross = (a: V3, b: V3): V3 => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    });
    const rightRaw = cross(fwd, up);
    const rl = Math.hypot(rightRaw.x, rightRaw.y, rightRaw.z) || 1;
    const right = { x: rightRaw.x / rl, y: rightRaw.y / rl, z: rightRaw.z / rl };
    const upCam = cross(right, fwd);
    const rect = (
      el.querySelector('.gl-container canvas') ?? el
    ).getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const halfW = dist * TAN_HALF_FOVY * (rect.width / rect.height);
    const halfH = dist * TAN_HALF_FOVY;
    const t = {
      x: center.x + right.x * nx * halfW + upCam.x * ny * halfH,
      y: center.y + right.y * nx * halfW + upCam.y * ny * halfH,
      z: center.z + right.z * nx * halfW + upCam.z * ny * halfH,
    };
    // Rays that miss the scene box anchor the pivot-plane point in
    // empty space — zooming there strands the camera in the void. Clamp
    // the aim point into the box so the pivot lands on the scene edge.
    const bounds = (
      el as unknown as {
        _fullLayout?: {
          scene?: { _scene?: { glplot?: { bounds?: number[][] } } };
        };
      }
    )._fullLayout?.scene?._scene?.glplot?.bounds;
    if (bounds) {
      const dir = { x: t.x - eye.x, y: t.y - eye.y, z: t.z - eye.z };
      let t0 = -Infinity;
      let t1 = Infinity;
      for (const [i, ax] of (['x', 'y', 'z'] as const).entries()) {
        const d = dir[ax];
        if (Math.abs(d) < 1e-12) continue;
        const lo = (bounds[0][i] - eye[ax]) / d;
        const hi = (bounds[1][i] - eye[ax]) / d;
        t0 = Math.max(t0, Math.min(lo, hi));
        t1 = Math.min(t1, Math.max(lo, hi));
      }
      if (!(t1 >= t0 && t1 > 0)) {
        t.x = Math.min(Math.max(t.x, bounds[0][0]), bounds[1][0]);
        t.y = Math.min(Math.max(t.y, bounds[0][1]), bounds[1][1]);
        t.z = Math.min(Math.max(t.z, bounds[0][2]), bounds[1][2]);
      }
    }
    const s = Math.pow(ZOOM_STEP, -e.deltaY / 120);
    const k = 1 - s;
    const relayout = (
      Plotly as unknown as {
        relayout: (
          el: HTMLElement,
          key: string,
          val: unknown,
        ) => Promise<unknown>;
      }
    ).relayout;
    void relayout(el, 'scene.camera', {
      eye: {
        x: eye.x + (t.x - eye.x) * k,
        y: eye.y + (t.y - eye.y) * k,
        z: eye.z + (t.z - eye.z) * k,
      },
      center: {
        x: center.x + (t.x - center.x) * k,
        y: center.y + (t.y - center.y) * k,
        z: center.z + (t.z - center.z) * k,
      },
      up,
    });
  }

  // The translucent z=0 sheet occludes gl3d picking — the pick
  // framebuffer resolves the front-most fragment regardless of
  // hoverinfo — so hovering the surface below the plane gave no
  // tooltip. Zeroing the sheet's pick slots keeps it rendered but
  // invisible to the pick pass; plotly recreates GL objects on every
  // redraw, so it must re-run on plotly_afterplot.
  interface GlScene {
    traces?: Record<string, { data?: { name?: string }; surface?: GlSurface }>;
    glplot?: { remove: (s: GlSurface) => void; add: (s: GlSurface) => void };
  }
  interface GlSurface {
    pickSlots: number;
    __noPick?: boolean;
  }
  function unpickSheet(gd: HTMLDivElement) {
    const layout = (
      gd as unknown as { _fullLayout?: { scene?: { _scene?: GlScene } } }
    )._fullLayout;
    const scene = layout?.scene?._scene;
    if (!scene?.traces || !scene.glplot) return;
    for (const t of Object.values(scene.traces)) {
      if (t.data?.name === 'xysheet' && t.surface && !t.surface.__noPick) {
        t.surface.pickSlots = 0;
        scene.glplot.remove(t.surface); // re-add forces slot reallocation
        scene.glplot.add(t.surface); // stays last → still draws on top
        t.surface.__noPick = true;
      }
    }
  }
  // updatemenus hide/show traces via a per-trace `visible` array —
  // which gl3d traces ignore (scalar restyle+indices is the only form
  // that reaches them; cartesian traces honor the array fine). After
  // a menu click, `_fullLayout.updatemenus[].active` holds the chosen
  // button — re-apply its vis list to gl3d traces in the working form.
  // Runs on afterplot and is a no-op once state matches, so it can't
  // loop on its own restyles.
  function syncMenuVisibility(gd: HTMLDivElement) {
    if (!Plotly) return;
    const gd2 = gd as unknown as {
      _fullLayout?: {
        updatemenus?: { active?: number; buttons?: { args?: unknown[] }[] }[];
      };
      data?: { type?: string; visible?: unknown }[];
    };
    const data = gd2.data;
    if (!gd2._fullLayout?.updatemenus || !data) return;
    for (const m of gd2._fullLayout.updatemenus) {
      const vis = (
        typeof m.active === 'number' && m.active >= 0
          ? m.buttons?.[m.active]?.args
          : undefined
      )?.find(
        (a): a is { visible: unknown[] } =>
          !!a && Array.isArray((a as { visible?: unknown }).visible),
      )?.visible;
      if (!vis) continue;
      const off: number[] = [];
      const on: number[] = [];
      data.forEach((t, i) => {
        if (i >= vis.length || !t.type || !GL3D_TYPES.has(t.type)) return;
        const want = vis[i];
        const cur = t.visible === undefined ? true : t.visible;
        if (cur !== want) {
          (want === false || want === 'legendonly' ? off : on).push(i);
        }
      });
      if (off.length) void Plotly.restyle(gd, 'visible', false, off);
      if (on.length) void Plotly.restyle(gd, 'visible', true, on);
    }
  }

  // The afterplot listener is bound once per graph element — a remount
  // (the fail branch swapping in/out) gets a fresh element and a fresh
  // binding.
  let wiredEl: HTMLDivElement | undefined;

  onMount(() => {
    let alive = true;
    import('plotly.js-dist-min')
      .then((m) => {
        if (alive) Plotly = m.default;
      })
      .catch((e) => {
        if (alive) failed = e instanceof Error ? e.message : String(e);
      });
    return () => {
      alive = false;
      if (el && Plotly) Plotly.purge(el);
    };
  });

  $effect(() => {
    // `plot` is read synchronously so every payload swap re-renders —
    // rows are keyed by index, so without this the figure would keep
    // showing whatever was evaluated when the row first mounted.
    // `appStore.darkMode` re-renders on theme flips.
    const p = plot;
    const target = el;
    const P = Plotly;
    const dark = appStore.darkMode;
    if (!target || !P) return;
    const { data, layout } = themedFigure(p, dark);
    applyModeAxes({ data, layout });
    P.react(target, data, { ...layout, autosize: true }, CONFIG).catch(
      (e) => {
        failed = e instanceof Error ? e.message : String(e);
      },
    );
    // Baseline eye↔center distance for the zoom readout — reset
    // whenever the payload re-renders.
    const lay = layout as Record<string, unknown>;
    baseEye = 0;
    for (const key of Object.keys(lay)) {
      if (!/^scene\d*$/.test(key)) continue;
      const cam = (lay[key] as { camera?: SceneCam })?.camera;
      if (cam?.eye) baseEye = eyeDist(cam);
    }
    updateZoom(target);
    if (wiredEl !== target) {
      (
        target as unknown as { on: (ev: string, cb: () => void) => void }
      ).on('plotly_afterplot', () => {
        unpickSheet(target);
        syncMenuVisibility(target);
        updateZoom(target);
      });
      // gl3d wheel/drag camera moves are camera relayouts — afterplot
      // doesn't always fire for them, so refresh the readout here too.
      (
        target as unknown as { on: (ev: string, cb: () => void) => void }
      ).on('plotly_relayout', () => updateZoom(target));
      // Zoom-to-cursor: capture beats plotly's own wheel handler on
      // the gl canvas.
      target.addEventListener('wheel', onSceneWheel, {
        capture: true,
        passive: false,
      });
      wiredEl = target;
    }
  });
</script>

<div class="plot-view" style:width="{width}px">
  {#if failed}
    <div class="plot-fail">couldn't render the plot: {failed}</div>
  {:else}
    <div class="plot-el" bind:this={el} style:height="{height}px"></div>
    <div
      class="plot-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize plot height"
      onpointerdown={onGripDown}
    ></div>
    <div
      class="plot-grip-side"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize plot width"
      onpointerdown={onSideGripDown}
    ></div>
    {#if zoomText}
      <div class="plot-zoom">{zoomText}</div>
    {/if}
  {/if}
</div>

<style>
  .plot-view {
    /* Explicit width — as a column-flex item inside .calc-row, auto
       margins can only center the block when its width is resolved.
       The right-edge grip can grow it up to the row's full width. */
    position: relative;
    max-width: 100%;
    margin: 4px auto;
  }
  .plot-el {
    width: 100%;
  }
  .plot-grip {
    height: 12px;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plot-grip::before {
    content: '';
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--faint, #cbd2dc);
    transition: background 0.15s;
  }
  .plot-grip:hover::before,
  .plot-grip:active::before {
    background: var(--muted, #94a3b8);
  }
  .plot-grip-side {
    position: absolute;
    top: 0;
    right: -6px;
    bottom: 12px;
    width: 12px;
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plot-grip-side::before {
    content: '';
    width: 4px;
    height: 36px;
    border-radius: 2px;
    background: var(--faint, #cbd2dc);
    transition: background 0.15s;
  }
  .plot-grip-side:hover::before,
  .plot-grip-side:active::before {
    background: var(--muted, #94a3b8);
  }
  .plot-zoom {
    /* Debug aid — live camera-zoom readout (remove with updateZoom). */
    position: absolute;
    left: 8px;
    bottom: 14px;
    font-family: monospace;
    font-size: 12px;
    color: var(--muted, #94a3b8);
    pointer-events: none;
    user-select: none;
  }
  .plot-fail {
    color: var(--accent-text, #b91c1c);
    font-size: 13px;
  }
</style>
