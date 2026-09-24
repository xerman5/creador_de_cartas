<script lang="ts">
  import { cardPixels, cardSizeFor } from '../core/card';
  import type { LoadedProject } from '../core/project';
  import { renderCard, templateFor, type RenderOptions } from '../core/render';
  import type { CardRow } from '../core/types';

  let {
    row,
    lp,
    opts,
    onwarnings,
    displayWidth,
    lazy = false,
  }: {
    row: CardRow;
    lp: LoadedProject;
    opts: RenderOptions;
    onwarnings?: (warnings: string[]) => void;
    /** Ancho fijo en px de pantalla (el editor necesita que coincida con su capa de zonas). */
    displayWidth?: number;
    /** Dibujar solo cuando está (casi) a la vista; mientras tanto ocupa su sitio. */
    lazy?: boolean;
  } = $props();

  let canvas: HTMLCanvasElement;
  let visible = $state(false);
  let token = 0;
  let drawn: [CardRow, LoadedProject, RenderOptions] | null = null;

  // Tamaño conocido antes de dibujar: la galería no salta al ir apareciendo las cartas.
  const px = $derived(cardPixels(cardSizeFor(lp.project, templateFor(lp.project, row)), opts.dpi));
  const width = $derived(opts.bleed ? px.width : px.trimWidth);
  const height = $derived(opts.bleed ? px.height : px.trimHeight);
  const cssWidth = $derived(displayWidth ?? width / (window.devicePixelRatio || 1));

  $effect(() => {
    if (!lazy) return;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '600px 0px' });
    io.observe(canvas);
    return () => io.disconnect();
  });

  $effect(() => {
    const current: [CardRow, LoadedProject, RenderOptions] = [row, lp, opts];
    if (lazy && !visible) return;
    if (drawn && drawn.every((v, i) => v === current[i])) return; // ya está dibujada con estos datos
    const my = ++token;
    renderCard(row, lp, { ...opts }).then(({ canvas: out, warnings }) => {
      if (my !== token || !canvas) return; // llegó un render más nuevo o el componente ya no está
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d')!.drawImage(out, 0, 0);
      drawn = current;
      onwarnings?.(warnings);
    });
  });
</script>

<canvas bind:this={canvas} class:fixed={!!displayWidth} {width} {height} style:width="{cssWidth}px"></canvas>

<style>
  canvas {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 3px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.35);
    background: #333;
  }
  canvas.fixed {
    max-width: none;
    box-shadow: none;
    border-radius: 0;
  }
</style>
