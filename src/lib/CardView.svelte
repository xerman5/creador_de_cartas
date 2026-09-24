<script lang="ts">
  import type { LoadedProject } from '../core/project';
  import { renderCard, type RenderOptions } from '../core/render';
  import type { CardRow } from '../core/types';

  let {
    row,
    lp,
    opts,
    onwarnings,
    displayWidth,
  }: {
    row: CardRow;
    lp: LoadedProject;
    opts: RenderOptions;
    onwarnings?: (warnings: string[]) => void;
    /** Ancho fijo en px de pantalla (el editor necesita que coincida con su capa de zonas). */
    displayWidth?: number;
  } = $props();

  let canvas: HTMLCanvasElement;
  let cssWidth = $state(0);
  let token = 0;

  $effect(() => {
    const my = ++token;
    renderCard(row, lp, { ...opts }).then(({ canvas: out, warnings }) => {
      if (my !== token || !canvas) return; // llegó un render más nuevo o el componente ya no está
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d')!.drawImage(out, 0, 0);
      cssWidth = out.width / (window.devicePixelRatio || 1);
      onwarnings?.(warnings);
    });
  });
</script>

<canvas
  bind:this={canvas}
  class:fixed={!!displayWidth}
  style:width={displayWidth ? `${displayWidth}px` : cssWidth ? `${cssWidth}px` : undefined}
></canvas>

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
