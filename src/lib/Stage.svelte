<script lang="ts">
  import { dragRect, drawRect, snapTargets, type Guide, type Handle } from '../core/geometry';
  import { BLEED_MM, cardSizeFor } from '../core/card';
  import { ZONE_COLORS } from '../core/render';
  import type { CardRow, Rect, ZoneType } from '../core/types';
  import CardView from './CardView.svelte';
  import type { Workspace } from './workspace.svelte';

  let {
    ws,
    tipo,
    row,
    pxPerMm,
    grid,
    showGuides,
    unsafe,
    drawType = null,
    oncreate,
    selected = $bindable(),
    onwarnings,
  }: {
    ws: Workspace;
    tipo: string;
    row: CardRow;
    /** Píxeles de pantalla por milímetro. */
    pxPerMm: number;
    grid: number;
    showGuides: boolean;
    /** Zonas que entran en la zona peligrosa. */
    unsafe: Set<number>;
    /** Con un tipo, arrastrar sobre la carta traza una zona nueva de ese tipo. */
    drawType?: ZoneType | null;
    /** `rect` = trazado; `null` = clic sin arrastrar en `at` (mm). */
    oncreate?: (rect: Rect | null, at: { x: number; y: number }) => void;
    selected: number | null;
    onwarnings: (w: string[]) => void;
  } = $props();

  const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const SNAP_PX = 6;

  const lp = $derived(ws.lp!);
  const tpl = $derived(lp.project.templates[tipo]);
  const size = $derived(cardSizeFor(lp.project, tpl));
  const b = BLEED_MM;
  const width = $derived((size.width + 2 * b) * pxPerMm);
  const height = $derived((size.height + 2 * b) * pxPerMm);
  const opts = $derived({
    dpi: pxPerMm * 25.4 * (window.devicePixelRatio || 1),
    lang: ws.lang,
    bleed: true,
    guides: showGuides,
  });

  let guides = $state<Guide[]>([]);
  let dragging = $state(false);
  let draft = $state.raw<Rect | null>(null);
  let stageEl: HTMLDivElement;

  const px = (mm: number) => mm * pxPerMm;

  /** Punto de pantalla → mm desde la esquina del corte. */
  function toMm(ev: PointerEvent) {
    const box = stageEl.getBoundingClientRect();
    return { x: (ev.clientX - box.left) / pxPerMm - b, y: (ev.clientY - box.top) / pxPerMm - b };
  }

  function startDraw(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const a = toMm(e);
    const targets = snapTargets(size, tpl.zones, -1);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;

    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) >= 4;
      if (!moved) return;
      const res = drawRect(a, toMm(ev), targets, { grid, threshold: SNAP_PX / pxPerMm, free: ev.altKey });
      draft = res.rect;
      guides = res.guides;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      const rect = moved ? draft : null;
      draft = null;
      guides = [];
      oncreate?.(rect, a);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function startDrag(e: PointerEvent, index: number, handle: Handle) {
    if (e.button !== 0 || drawType) return;
    e.preventDefault();
    e.stopPropagation();
    selected = index;
    const r0 = { ...tpl.zones[index].rect };
    const targets = snapTargets(size, tpl.zones, index);
    const sx = e.clientX;
    const sy = e.clientY;
    let began = false;

    const move = (ev: PointerEvent) => {
      if (!began) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        ws.begin();
        began = true;
        dragging = true;
      }
      const res = dragRect(r0, handle, (ev.clientX - sx) / pxPerMm, (ev.clientY - sy) / pxPerMm, targets, {
        grid,
        threshold: SNAP_PX / pxPerMm,
        free: ev.altKey,
      });
      guides = res.guides;
      ws.update((p) => void (p.templates[tipo].zones[index].rect = res.rect), { live: true });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      guides = [];
      dragging = false;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={stageEl}
  class="stage"
  class:dragging
  class:drawing={!!drawType}
  style:width="{width}px"
  style:height="{height}px"
  onpointerdown={(e) => (drawType ? startDraw(e) : (selected = null))}
>
  <CardView {row} {lp} {opts} {onwarnings} displayWidth={width} />

  <div class="overlay" style:left="{px(b)}px" style:top="{px(b)}px">
    {#each tpl.zones as zone, i (i)}
      <div
        class="zone"
        class:selected={selected === i}
        class:hidden={zone.hidden}
        class:locked={zone.locked}
        class:unsafe={unsafe.has(i)}
        style:--c={ZONE_COLORS[zone.type]}
        style:left="{px(zone.rect.x)}px"
        style:top="{px(zone.rect.y)}px"
        style:width="{px(zone.rect.w)}px"
        style:height="{px(zone.rect.h)}px"
        onpointerdown={(e) => startDrag(e, i, 'move')}
      >
        <span class="label">{zone.id}</span>
        {#if selected === i && !zone.locked}
          {#each HANDLES as h}
            <span class="handle {h}" onpointerdown={(e) => startDrag(e, i, h)}></span>
          {/each}
        {/if}
      </div>
    {/each}

    {#if draft && drawType}
      <div
        class="zone draft"
        style:--c={ZONE_COLORS[drawType]}
        style:left="{px(draft.x)}px"
        style:top="{px(draft.y)}px"
        style:width="{px(draft.w)}px"
        style:height="{px(draft.h)}px"
      >
        <span class="size">{draft.w} × {draft.h} mm</span>
      </div>
    {/if}

    {#each guides as g}
      <div
        class="guide {g.axis}"
        style:left={g.axis === 'x' ? `${px(g.at)}px` : undefined}
        style:top={g.axis === 'y' ? `${px(g.at)}px` : undefined}
      ></div>
    {/each}
  </div>
</div>

<style>
  .stage {
    position: relative;
    flex: none;
    box-shadow: 0 4px 24px rgb(0 0 0 / 0.5);
    user-select: none;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    width: 0;
    height: 0;
  }
  .zone {
    position: absolute;
    outline: 1px dashed color-mix(in srgb, var(--c) 70%, transparent);
    cursor: move;
  }
  .zone:hover {
    outline: 1px solid var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
  .zone.selected {
    outline: 2px solid var(--c);
    z-index: 2;
  }
  .drawing,
  .drawing .zone {
    cursor: crosshair;
  }
  .zone.draft {
    outline: 2px dashed var(--c);
    background: color-mix(in srgb, var(--c) 18%, transparent);
    pointer-events: none;
    z-index: 4;
  }
  .size {
    position: absolute;
    right: 0;
    bottom: -18px;
    font-size: 10px;
    padding: 0 4px;
    background: var(--c);
    color: #000;
    border-radius: 3px;
    white-space: nowrap;
  }
  .zone.unsafe {
    outline: 2px solid #ff3b30;
  }
  .zone.unsafe .label {
    background: #ff3b30;
    color: #fff;
    opacity: 1;
  }
  .zone.hidden {
    opacity: 0.4;
  }
  .zone.locked {
    pointer-events: none;
    outline-style: dotted;
    outline-color: color-mix(in srgb, var(--c) 35%, transparent);
  }
  .label {
    position: absolute;
    left: -1px;
    top: -16px;
    font-size: 10px;
    line-height: 14px;
    padding: 0 4px;
    background: var(--c);
    color: #000;
    white-space: nowrap;
    border-radius: 3px 3px 0 0;
    opacity: 0;
    pointer-events: none;
  }
  .zone:hover .label,
  .zone.selected .label {
    opacity: 1;
  }
  .dragging .zone:not(.selected) .label {
    opacity: 0;
  }
  .handle {
    position: absolute;
    width: 9px;
    height: 9px;
    background: #fff;
    border: 1.5px solid var(--c);
    border-radius: 2px;
    transform: translate(-50%, -50%);
  }
  .nw { left: 0; top: 0; cursor: nwse-resize; }
  .n { left: 50%; top: 0; cursor: ns-resize; }
  .ne { left: 100%; top: 0; cursor: nesw-resize; }
  .e { left: 100%; top: 50%; cursor: ew-resize; }
  .se { left: 100%; top: 100%; cursor: nwse-resize; }
  .s { left: 50%; top: 100%; cursor: ns-resize; }
  .sw { left: 0; top: 100%; cursor: nesw-resize; }
  .w { left: 0; top: 50%; cursor: ew-resize; }
  .guide {
    position: absolute;
    background: #ff2d95;
    pointer-events: none;
    z-index: 3;
  }
  .guide.x {
    top: -2000px;
    height: 4000px;
    width: 1px;
  }
  .guide.y {
    left: -2000px;
    width: 4000px;
    height: 1px;
  }
</style>
