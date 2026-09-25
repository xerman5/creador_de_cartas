<script lang="ts">
  import type { ShapeZone } from '../../core/types';
  import type { Palette, PieceStyle } from '../../core/wizard/answers';
  import Swatches from './Swatches.svelte';

  /** Una pieza del diseño (banda, caja, fondo…): color o transparente, opacidad y borde. */
  let {
    zone,
    style,
    label,
    palette,
    fillable = true,
    onchange,
  }: {
    zone: ShapeZone;
    /** Lo ajustado hasta ahora (lo que falta sale de la zona). */
    style: PieceStyle;
    label: string;
    palette: Palette;
    /** Sin relleno (un marco de solo borde) solo se ofrece el borde. */
    fillable?: boolean;
    onchange: (patch: Partial<PieceStyle>) => void;
  } = $props();

  const fill = $derived(style.fill ?? (zone.fill || 'none'));
  const opacity = $derived(style.opacity ?? zone.opacity ?? 1);
  const border = $derived(style.border ?? !!zone.stroke);
</script>

<div class="ctl">
  <span class="lbl">{label}</span>
  {#if fillable}
    <Swatches value={fill} {label} {palette} onpick={(c) => onchange({ fill: c })} />
    <label class="inline" title="Opacidad">
      <input type="range" min="0" max="1" step="0.05" value={opacity} oninput={(e) => onchange({ opacity: e.currentTarget.valueAsNumber })} aria-label="Opacidad de {label}" />
      {Math.round(opacity * 100)} %
    </label>
  {/if}
  <label class="inline"><input type="checkbox" checked={border} onchange={(e) => onchange({ border: e.currentTarget.checked })} /> Borde</label>
</div>

<style>
  .ctl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
  }
  .lbl {
    min-width: 110px;
    font-weight: 600;
    font-size: 13px;
  }
  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
  }
</style>
