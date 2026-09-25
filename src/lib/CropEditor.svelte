<script lang="ts">
  import { CENTERED, coverRect, formatCrop, MAX_ZOOM, parseCrop, type Crop } from '../core/crop';

  /**
   * Encuadre de una imagen en su zona: se arrastra para mover y la rueda o el deslizador amplían.
   * Lo que se ve es exactamente lo que sale en la carta.
   */
  let {
    src,
    aspect,
    value,
    onchange,
    width = 260,
    label = 'Encuadre',
  }: {
    src: string;
    /** Ancho / alto de la zona. */
    aspect: number;
    value: string | undefined;
    onchange: (value: string) => void;
    width?: number;
    label?: string;
  } = $props();

  let natural = $state<{ w: number; h: number } | null>(null);
  const boxW = $derived(aspect >= 1 ? width : Math.round(width * aspect));
  const boxH = $derived(aspect >= 1 ? Math.round(width / aspect) : width);
  const crop = $derived(parseCrop(value));
  const rect = $derived(natural ? coverRect(natural.w, natural.h, { x: 0, y: 0, w: boxW, h: boxH }, crop) : null);

  function set(c: Crop) {
    onchange(formatCrop(c));
  }

  function drag(e: PointerEvent) {
    if (e.button !== 0 || !rect) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, crop, w: rect.w, h: rect.h };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      // Arrastrar la imagen a la derecha lleva el centro de la zona hacia su izquierda.
      const x = Math.min(1, Math.max(0, start.crop.x - (ev.clientX - start.x) / start.w));
      const y = Math.min(1, Math.max(0, start.crop.y - (ev.clientY - start.y) / start.h));
      set({ ...start.crop, x, y });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    set({ ...crop, zoom });
  }
</script>

<div class="crop">
  <div
    class="box"
    style:width="{boxW}px"
    style:height="{boxH}px"
    role="slider"
    tabindex="0"
    aria-label="{label}: arrastra para mover la imagen"
    aria-valuenow={Math.round(crop.zoom * 100)}
    onpointerdown={drag}
    onwheel={wheel}
    onkeydown={(e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!d) return;
      e.preventDefault();
      set({ ...crop, x: Math.min(1, Math.max(0, crop.x + d[0])), y: Math.min(1, Math.max(0, crop.y + d[1])) });
    }}
  >
    <img
      {src}
      alt=""
      draggable="false"
      onload={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        natural = { w: img.naturalWidth, h: img.naturalHeight };
      }}
      style:left="{rect?.x ?? 0}px"
      style:top="{rect?.y ?? 0}px"
      style:width={rect ? `${rect.w}px` : '100%'}
      style:height={rect ? `${rect.h}px` : 'auto'}
    />
    <span class="grid"></span>
  </div>
  <div class="controls">
    <label title="Ampliar">
      🔍
      <input
        type="range"
        min="1"
        max={MAX_ZOOM}
        step="0.05"
        value={crop.zoom}
        oninput={(e) => set({ ...crop, zoom: e.currentTarget.valueAsNumber })}
        aria-label="{label}: ampliación"
      />
      {Math.round(crop.zoom * 100)} %
    </label>
    <button class="ghost small" onclick={() => set(CENTERED)} disabled={!value}>Centrar</button>
  </div>
</div>

<style>
  .crop {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .box {
    position: relative;
    overflow: hidden;
    border-radius: 4px;
    outline: 1px solid var(--border);
    background: #2b2f38;
    cursor: grab;
    touch-action: none;
  }
  .box:active {
    cursor: grabbing;
  }
  .box:focus-visible {
    outline: 2px solid var(--accent);
  }
  img {
    position: absolute;
    max-width: none;
    user-select: none;
    pointer-events: none;
  }
  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(to right, transparent 33.2%, rgb(255 255 255 / 0.35) 33.3%, transparent 33.5%, transparent 66.5%, rgb(255 255 255 / 0.35) 66.6%, transparent 66.8%),
      linear-gradient(to bottom, transparent 33.2%, rgb(255 255 255 / 0.35) 33.3%, transparent 33.5%, transparent 66.5%, rgb(255 255 255 / 0.35) 66.6%, transparent 66.8%);
  }
  .controls {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    color: var(--muted);
  }
  .controls label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  button.small {
    padding: 2px 8px;
    font-size: 12px;
  }
</style>
