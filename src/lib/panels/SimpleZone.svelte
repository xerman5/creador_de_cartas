<script lang="ts">
  import type { Zone } from '../../core/types';
  import { FONT_PAIRS } from '../../core/wizard/answers';
  import AssetField from '../AssetField.svelte';
  import type { Workspace } from '../workspace.svelte';
  import ColorChoice from './ColorChoice.svelte';

  /**
   * Los ajustes más habituales de una zona, en lenguaje de carta (color, tamaño, letra, imagen,
   * iconos). Lo demás está en el modo avanzado.
   */
  let { ws, tipo, index }: { ws: Workspace; tipo: string; index: number } = $props();

  const zone = $derived(ws.project!.templates[tipo].zones[index]);
  const colors = $derived(ws.project!.colors ?? {});
  const families = $derived.by(() => {
    const out = new Map<string, string>();
    for (const f of ws.project!.fonts) out.set(`"${f.family}", Georgia, serif`, f.family);
    for (const p of Object.values(FONT_PAIRS)) {
      out.set(p.title, p.title.split(',')[0]);
      out.set(p.body, p.body.split(',')[0]);
    }
    return out;
  });

  /** Edita la zona; las ediciones seguidas del mismo control se deshacen de una vez. */
  function edit(key: string, fn: (z: any) => void) {
    ws.update((p) => fn(p.templates[tipo].zones[index]), { coalesce: `${tipo}/${index}/sencillo/${key}` });
  }

  const r1 = (v: number) => Math.round(v * 100) / 100;
  const kind: Record<Zone['type'], string> = {
    text: 'Texto',
    image: 'Imagen',
    shape: 'Forma',
    attributes: 'Lista de atributos',
    attribute: 'Atributo fijo',
  };
</script>

{#snippet seg(label: string, value: string | undefined, options: [string, string][], key: string, set: (z: any, v: string) => void)}
  <div class="ctl">
    <span class="lbl">{label}</span>
    <div class="seg" role="group" aria-label={label}>
      {#each options as [v, text]}
        <button class:active={value === v} onclick={() => edit(key, (z) => set(z, v))}>{text}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet slider(label: string, value: number, min: number, max: number, step: number, unit: string, key: string, set: (z: any, v: number) => void)}
  <div class="ctl">
    <span class="lbl">{label}</span>
    <label class="inline">
      <input type="range" {min} {max} {step} {value} oninput={(e) => edit(key, (z) => set(z, e.currentTarget.valueAsNumber))} aria-label={label} />
      {r1(value)} {unit}
    </label>
  </div>
{/snippet}

<div class="simple">
  <h4>{zone.id} <small>{kind[zone.type]}</small></h4>

  {#if zone.type === 'text'}
    <div class="ctl">
      <span class="lbl">Color</span>
      <ColorChoice value={zone.font.color} label="Color del texto" {colors} onchange={(v) => edit('color', (z) => (z.font.color = v))} />
    </div>
    {@render seg('Alineación', zone.align ?? 'left', [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justificado']], 'align', (z, v) => (z.align = v))}
    {@render seg('Vertical', zone.valign ?? 'top', [['top', 'Arriba'], ['middle', 'Centro'], ['bottom', 'Abajo']], 'valign', (z, v) => (z.valign = v))}
    {@render slider('Tamaño', zone.font.size, 4, 40, 0.25, 'pt', 'size', (z, v) => (z.font.size = v))}
    <div class="ctl">
      <span class="lbl">Letra</span>
      <select value={zone.font.family} onchange={(e) => edit('family', (z) => (z.font.family = e.currentTarget.value))} aria-label="Letra">
        {#if !families.has(zone.font.family)}<option value={zone.font.family}>{zone.font.family}</option>{/if}
        {#each [...families] as [value, name]}<option {value} style:font-family={value}>{name}</option>{/each}
      </select>
      <label class="inline"><input type="checkbox" checked={zone.font.weight === 'bold'} onchange={(e) => edit('bold', (z) => (z.font.weight = e.currentTarget.checked ? 'bold' : 'normal'))} /> Negrita</label>
      <label class="inline"><input type="checkbox" checked={zone.font.style === 'italic'} onchange={(e) => edit('italic', (z) => (z.font.style = e.currentTarget.checked ? 'italic' : 'normal'))} /> Cursiva</label>
    </div>
    <p class="hint">Si el texto no cabe, se reduce solo hasta {zone.minSize ?? zone.font.size} pt (en Avanzado, «tamaño mínimo»).</p>
  {:else if zone.type === 'shape'}
    <div class="ctl">
      <span class="lbl">Relleno</span>
      <ColorChoice value={zone.fill} label="Relleno" {colors} none onchange={(v) => edit('fill', (z) => (z.fill = v))} />
    </div>
    {@render slider('Opacidad', (zone.opacity ?? 1) * 100, 0, 100, 5, '%', 'opacity', (z, v) => (z.opacity = v / 100))}
    <div class="ctl">
      <span class="lbl">Borde</span>
      <label class="inline">
        <input
          type="checkbox"
          checked={!!zone.stroke}
          onchange={(e) => edit('stroke', (z) => {
            z.stroke = e.currentTarget.checked ? (z.stroke ?? 'tinta') : undefined;
            z.strokeWidth ??= 0.4;
          })}
        />
        Con borde
      </label>
      {#if zone.stroke}<ColorChoice value={zone.stroke} label="Color del borde" {colors} onchange={(v) => edit('strokeColor', (z) => (z.stroke = v))} />{/if}
    </div>
    {#if zone.stroke}{@render slider('Grosor del borde', zone.strokeWidth ?? 0.4, 0.1, 3, 0.05, 'mm', 'strokeWidth', (z, v) => (z.strokeWidth = v))}{/if}
    {@render seg('Forma', zone.shape ?? 'rect', [['rect', 'Rectángulo'], ['ellipse', 'Elipse']], 'shape', (z, v) => (z.shape = v))}
    {#if (zone.shape ?? 'rect') === 'rect'}{@render slider('Esquinas', zone.radius ?? 0, 0, 10, 0.1, 'mm', 'radius', (z, v) => (z.radius = v))}{/if}
  {:else if zone.type === 'image'}
    <div class="ctl col">
      <span class="lbl">Imagen</span>
      <AssetField {ws} value={zone.default} subdir="fondos" onchange={(v) => edit('default', (z) => (z.default = v || undefined))} />
    </div>
    {@render seg('Ajuste', zone.fit ?? 'cover', [['cover', 'Cubrir'], ['contain', 'Entera'], ['stretch', 'Estirar']], 'fit', (z, v) => (z.fit = v))}
    {#if (zone.fit ?? 'cover') === 'cover'}
      <div class="ctl">
        <span class="lbl">Encuadre</span>
        <label class="inline">
          <input type="checkbox" checked={!!zone.cropBind} onchange={(e) => edit('crop', (z) => (z.cropBind = e.currentTarget.checked ? 'encuadre' : undefined))} />
          Encuadrar cada carta (columna «{zone.cropBind ?? 'encuadre'}», en la Tabla)
        </label>
      </div>
    {/if}
    {#if zone.bind}<p class="hint">Cada carta puede llevar su propia imagen en la columna «{zone.bind}»; esta es la de por defecto.</p>{/if}
  {:else if zone.type === 'attributes'}
    {@render slider('Tamaño de los iconos', zone.iconSize, 2, 15, 0.1, 'mm', 'iconSize', (z, v) => (z.iconSize = v))}
    {@render seg('Dirección', zone.direction ?? 'column', [['column', 'En columna'], ['row', 'En fila']], 'direction', (z, v) => (z.direction = v))}
    {@render seg('Alineación', zone.align ?? 'start', [['start', 'Al principio'], ['center', 'Centro'], ['end', 'Al final']], 'align', (z, v) => (z.align = v))}
    {@render seg('Número', zone.valuePosition ?? 'over', [['over', 'Encima'], ['after', 'Al lado'], ['below', 'Debajo']], 'value', (z, v) => (z.valuePosition = v))}
    <div class="ctl">
      <span class="lbl">Nombre</span>
      <label class="inline"><input type="checkbox" checked={!!zone.labels} onchange={(e) => edit('labels', (z) => (z.labels = e.currentTarget.checked || undefined))} /> Escribir el nombre si no hay número</label>
    </div>
    <div class="ctl">
      <span class="lbl">Fondo del icono</span>
      <ColorChoice value={zone.backdrop} label="Fondo del icono" {colors} none onchange={(v) => edit('backdrop', (z) => (z.backdrop = v))} />
    </div>
    <div class="ctl">
      <span class="lbl">Color del número</span>
      <ColorChoice value={zone.font.color} label="Color del número" {colors} onchange={(v) => edit('color', (z) => (z.font.color = v))} />
    </div>
  {:else if zone.type === 'attribute'}
    <div class="ctl col">
      <span class="lbl">Icono propio</span>
      <AssetField {ws} value={zone.icon} subdir="iconos" placeholder="el del catálogo" onchange={(v) => edit('icon', (z) => (z.icon = v || undefined))} />
    </div>
    {@render seg('Número', zone.valuePosition ?? 'over', [['over', 'Encima'], ['after', 'Al lado'], ['below', 'Debajo'], ['none', 'Sin número']], 'value', (z, v) => (z.valuePosition = v))}
    {@render slider('Tamaño del número', zone.font.size, 4, 40, 0.25, 'pt', 'size', (z, v) => (z.font.size = v))}
    <div class="ctl">
      <span class="lbl">Color del número</span>
      <ColorChoice value={zone.font.color} label="Color del número" {colors} onchange={(v) => edit('color', (z) => (z.font.color = v))} />
    </div>
  {/if}
  <p class="hint">Posición y tamaño: arrastra la zona en la carta. Columnas, condiciones y el resto de propiedades, en «Avanzado».</p>
</div>

<style>
  .simple {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h4 {
    margin: 0;
  }
  h4 small {
    font-weight: normal;
    color: var(--muted);
    margin-left: 6px;
  }
  .ctl {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
  }
  .ctl.col {
    flex-direction: column;
    align-items: stretch;
  }
  .lbl {
    font-weight: 600;
    font-size: 12px;
    width: 100%;
  }
  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 12px;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
  }
  .seg button {
    border-radius: 0;
    padding: 3px 8px;
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
  select {
    max-width: 100%;
  }
  .hint {
    color: var(--muted);
    font-size: 11px;
    margin: 0;
  }
</style>
