<script lang="ts">
  import type { TextZone } from '../../core/types';
  import type { Palette, TextStyle } from '../../core/wizard/answers';
  import Swatches from './Swatches.svelte';

  /** Un texto de la carta: color, alineación, tamaño y letra. */
  let {
    zone,
    style,
    label,
    palette,
    fonts,
    custom = [],
    onchange,
  }: {
    zone: TextZone;
    style: TextStyle;
    label: string;
    palette: Palette;
    /** Letras de títulos y de textos del diseño. */
    fonts: { title: string; body: string };
    /** Fuentes propias del proyecto (nombres de familia). */
    custom?: string[];
    onchange: (patch: Partial<TextStyle>) => void;
  } = $props();

  /** La letra que usa ahora: la elegida o, si no, la de la zona. */
  const family = $derived(
    style.font ??
      (custom.find((c) => zone.font.family.startsWith(`"${c}"`)) ?? (zone.font.family === fonts.title && fonts.title !== fonts.body ? 'title' : 'body')),
  );
</script>

<div class="ctl">
  <span class="lbl">Color</span>
  <Swatches value={style.color} label="{label}, color" {palette} none={false} onpick={(c) => onchange({ color: c as TextStyle['color'] })} />
</div>
<div class="ctl">
  <span class="lbl">Alineación</span>
  <div class="seg" role="group" aria-label="Alineación de {label}">
    {#each [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justificado']] as [v, name]}
      <button class:active={(style.align ?? zone.align ?? 'left') === v} onclick={() => onchange({ align: v as TextStyle['align'] })}>{name}</button>
    {/each}
  </div>
</div>
<div class="ctl">
  <span class="lbl">Tamaño</span>
  <label class="inline">
    <input type="range" min="0.7" max="1.5" step="0.05" value={style.scale ?? 1} oninput={(e) => onchange({ scale: e.currentTarget.valueAsNumber })} aria-label="Tamaño de {label}" />
    {Math.round((style.scale ?? 1) * 100)} %
  </label>
</div>
<div class="ctl">
  <span class="lbl">Letra</span>
  <div class="seg" role="group" aria-label="Letra de {label}">
    <button class:active={family === 'title'} onclick={() => onchange({ font: 'title' })} style:font-family={fonts.title}>La de títulos</button>
    <button class:active={family === 'body'} onclick={() => onchange({ font: 'body' })} style:font-family={fonts.body}>La de textos</button>
    {#each custom as c}
      <button class:active={family === c} onclick={() => onchange({ font: c })} style:font-family={`"${c}"`}>{c}</button>
    {/each}
  </div>
  <label class="inline"><input type="checkbox" checked={style.bold ?? zone.font.weight === 'bold'} onchange={(e) => onchange({ bold: e.currentTarget.checked })} /> Negrita</label>
  <label class="inline"><input type="checkbox" checked={style.italic ?? zone.font.style === 'italic'} onchange={(e) => onchange({ italic: e.currentTarget.checked })} /> Cursiva</label>
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
  .seg {
    display: flex;
    flex-wrap: wrap;
  }
  .seg button {
    border-radius: 0;
    padding: 3px 9px;
    font-size: 12px;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .seg button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
