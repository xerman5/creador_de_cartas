<script lang="ts">
  import type { FontSpec, Zone } from '../core/types';
  import { ZONE_LABELS } from '../core/zones';
  import AssetField from './AssetField.svelte';
  import type { Workspace } from './workspace.svelte';

  let {
    ws,
    tipo,
    index,
    columns,
  }: {
    ws: Workspace;
    tipo: string;
    index: number;
    /** Columnas del CSV sin sufijo de idioma, para sugerir vínculos. */
    columns: string[];
  } = $props();

  const zone = $derived(ws.project!.templates[tipo].zones[index]);
  const attrKeys = $derived(Object.keys(ws.project!.attributes));
  const fontFamilies = $derived([
    ...new Set([...ws.project!.fonts.map((f) => f.family), 'Georgia, serif', 'Arial, sans-serif', 'Times New Roman, serif']),
  ]);

  /** Edita la zona seleccionada; las ediciones seguidas del mismo campo se deshacen de una vez. */
  function edit(key: string, fn: (z: any) => void) {
    ws.update((p) => fn(p.templates[tipo].zones[index]), { coalesce: `${tipo}/${index}/${key}` });
  }

  function toHex(color: string | undefined): string {
    if (!color) return '#000000';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
    return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : '#000000';
  }

  const num = (e: Event) => (e.currentTarget as HTMLInputElement).valueAsNumber;
  const str = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

{#snippet number(label: string, value: number | undefined, key: string, set: (z: any, v: number) => void, step = 0.5, unit = 'mm')}
  <label class="f">
    <span>{label}</span>
    <span class="unit">
      <input
        type="number"
        {step}
        value={value ?? ''}
        onchange={(e) => {
          const v = num(e);
          if (!Number.isNaN(v)) edit(key, (z) => set(z, v));
        }}
      />
      <small>{unit}</small>
    </span>
  </label>
{/snippet}

{#snippet select(label: string, value: string | undefined, key: string, options: [string, string][], set: (z: any, v: string) => void)}
  <label class="f">
    <span>{label}</span>
    <select value={value ?? options[0][0]} onchange={(e) => edit(key, (z) => set(z, str(e)))}>
      {#each options as [v, text]}<option value={v}>{text}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet column(label: string, value: string | undefined, key: string, set: (z: any, v: string) => void)}
  <label class="f">
    <span>{label}</span>
    <input
      type="text"
      list="csv-columns"
      value={value ?? ''}
      placeholder="(ninguna)"
      onchange={(e) => edit(key, (z) => set(z, str(e).trim()))}
    />
  </label>
{/snippet}

{#snippet color(label: string, value: string | undefined, key: string, set: (z: any, v: string | undefined) => void)}
  <label class="f">
    <span>{label}</span>
    <span class="color">
      <input type="color" value={toHex(value)} oninput={(e) => edit(key, (z) => set(z, str(e)))} />
      <input
        type="text"
        value={value ?? ''}
        placeholder="—"
        onchange={(e) => edit(key, (z) => set(z, str(e).trim() || undefined))}
      />
    </span>
  </label>
{/snippet}

{#snippet fontEditor(f: FontSpec)}
  <h4>Fuente</h4>
  <label class="f">
    <span>Familia</span>
    <input
      type="text"
      list="font-families"
      value={f.family}
      onchange={(e) => edit('font.family', (z) => (z.font.family = str(e)))}
    />
  </label>
  {@render number('Tamaño', f.size, 'font.size', (z, v) => (z.font.size = v), 0.25, 'pt')}
  {@render select('Peso', String(f.weight ?? 'normal'), 'font.weight', [
    ['normal', 'Normal'],
    ['bold', 'Negrita'],
    ['300', 'Fina (300)'],
    ['500', 'Media (500)'],
    ['600', 'Seminegrita (600)'],
    ['800', 'Extranegrita (800)'],
  ], (z, v) => (z.font.weight = v))}
  <label class="check">
    <input
      type="checkbox"
      checked={f.style === 'italic'}
      onchange={(e) => edit('font.style', (z) => (z.font.style = e.currentTarget.checked ? 'italic' : undefined))}
    />
    Cursiva
  </label>
  {@render color('Color', f.color, 'font.color', (z, v) => (z.font.color = v))}
  {@render color('Contorno', f.strokeColor, 'font.strokeColor', (z, v) => (z.font.strokeColor = v))}
  {@render number('Grosor contorno', f.strokeWidth, 'font.strokeWidth', (z, v) => (z.font.strokeWidth = v), 0.05)}
{/snippet}

<datalist id="csv-columns">
  {#each columns as c}<option value={c}></option>{/each}
</datalist>
<datalist id="font-families">
  {#each fontFamilies as f}<option value={f}></option>{/each}
</datalist>

<div class="props">
  <header>
    <span class="type">{ZONE_LABELS[zone.type]}</span>
    <input
      class="id"
      type="text"
      value={zone.id}
      title="Nombre de la zona"
      onchange={(e) => edit('id', (z) => (z.id = str(e).trim() || z.id))}
    />
  </header>

  <h4>Posición</h4>
  <div class="grid2">
    {@render number('X', zone.rect.x, 'rect.x', (z, v) => (z.rect.x = v))}
    {@render number('Y', zone.rect.y, 'rect.y', (z, v) => (z.rect.y = v))}
    {@render number('Ancho', zone.rect.w, 'rect.w', (z, v) => (z.rect.w = Math.max(1, v)))}
    {@render number('Alto', zone.rect.h, 'rect.h', (z, v) => (z.rect.h = Math.max(1, v)))}
  </div>
  <label class="check" title="Los bordes que tocan el borde de la carta se extienden hasta el sangrado">
    <input type="checkbox" checked={!!zone.bleed} onchange={(e) => edit('bleed', (z) => (z.bleed = e.currentTarget.checked || undefined))} />
    Extender al sangrado
  </label>
  <label class="f">
    <span>Mostrar solo si</span>
    <input
      type="text"
      list="csv-columns"
      value={zone.showIf ?? ''}
      placeholder="siempre"
      onchange={(e) => edit('showIf', (z) => (z.showIf = str(e).trim() || undefined))}
    />
  </label>
  {#if zone.showIf}
    <p class="hint"><code>col</code> con valor · <code>!col</code> vacía · <code>col=a|b</code> igual a · <code>col!=a</code> distinta</p>
  {/if}

  {#if zone.type === 'image'}
    <h4>Imagen</h4>
    {@render column('Columna CSV', zone.bind, 'bind', (z, v) => (z.bind = v || undefined))}
    <div class="f">
      <span>Por defecto</span>
      <AssetField {ws} value={zone.default} subdir="marcos" onchange={(v) => edit('default', (z) => (z.default = v || undefined))} />
    </div>
    {@render select('Ajuste', zone.fit, 'fit', [
      ['cover', 'Cubrir (recorta)'],
      ['contain', 'Contener (entera)'],
      ['stretch', 'Estirar'],
    ], (z, v) => (z.fit = v))}
    <p class="hint">La celda del CSV sustituye la imagen por defecto; «-» la oculta en esa carta.</p>
  {:else if zone.type === 'text'}
    <h4>Texto</h4>
    {@render column('Columna CSV', zone.bind, 'bind', (z, v) => (z.bind = v))}
    <label class="f">
      <span>Texto fijo</span>
      <textarea
        rows="2"
        value={zone.default ?? ''}
        placeholder="si la celda está vacía"
        onchange={(e) => edit('default', (z) => (z.default = e.currentTarget.value || undefined))}
      ></textarea>
    </label>
    {@render select('Alineación', zone.align, 'align', [
      ['left', 'Izquierda'],
      ['center', 'Centro'],
      ['right', 'Derecha'],
      ['justify', 'Justificado'],
    ], (z, v) => (z.align = v))}
    {@render select('Vertical', zone.valign, 'valign', [
      ['top', 'Arriba'],
      ['middle', 'Centro'],
      ['bottom', 'Abajo'],
    ], (z, v) => (z.valign = v))}
    <div class="grid2">
      {@render number('Margen', zone.padding, 'padding', (z, v) => (z.padding = v))}
      {@render number('Interlineado', zone.lineHeight ?? 1.2, 'lineHeight', (z, v) => (z.lineHeight = v), 0.05, '×')}
    </div>
    {@render number('Tamaño mínimo', zone.minSize, 'minSize', (z, v) => (z.minSize = v), 0.25, 'pt')}
    {@render fontEditor(zone.font)}
  {:else if zone.type === 'attributes'}
    <h4>Lista de atributos</h4>
    {@render column('Columna CSV', zone.bind ?? 'atributos', 'bind', (z, v) => (z.bind = v || undefined))}
    <label class="f">
      <span>Solo estos</span>
      <input
        type="text"
        value={(zone.keys ?? []).join(', ')}
        placeholder="todos"
        onchange={(e) => {
          const keys = str(e).split(',').map((s) => s.trim()).filter(Boolean);
          edit('keys', (z) => (z.keys = keys.length ? keys : undefined));
        }}
      />
    </label>
    {@render select('Dirección', zone.direction, 'direction', [
      ['column', 'Vertical'],
      ['row', 'Horizontal'],
    ], (z, v) => (z.direction = v))}
    {@render select('Alineación', zone.align, 'align', [
      ['start', 'Al inicio'],
      ['center', 'Centrada'],
      ['end', 'Al final'],
    ], (z, v) => (z.align = v))}
    <div class="grid2">
      {@render number('Icono', zone.iconSize, 'iconSize', (z, v) => (z.iconSize = v))}
      {@render number('Separación', zone.gap ?? 1, 'gap', (z, v) => (z.gap = v), 0.1)}
    </div>
    {@render select('Valor', zone.valuePosition, 'valuePosition', [
      ['over', 'Encima del icono'],
      ['after', 'A la derecha'],
      ['below', 'Debajo'],
    ], (z, v) => (z.valuePosition = v))}
    {@render fontEditor(zone.font)}
  {:else if zone.type === 'attribute'}
    <h4>Atributo</h4>
    <label class="f">
      <span>Atributo</span>
      <select value={zone.key} onchange={(e) => edit('key', (z) => (z.key = str(e)))}>
        {#if !attrKeys.includes(zone.key)}<option value={zone.key}>{zone.key || '(elige)'}</option>{/if}
        {#each attrKeys as k}<option value={k}>{ws.project!.attributes[k].label ?? k}</option>{/each}
      </select>
    </label>
    {#if !attrKeys.length}
      <p class="hint warn">Aún no hay atributos. Créalos en la pestaña Proyecto.</p>
    {/if}
    <div class="f">
      <span>Icono propio</span>
      <AssetField
        {ws}
        value={zone.icon}
        subdir="iconos"
        placeholder="el del catálogo"
        onchange={(v) => edit('icon', (z) => (z.icon = v || undefined))}
      />
    </div>
    {@render select('Valor', zone.valuePosition, 'valuePosition', [
      ['over', 'Encima del icono'],
      ['after', 'A la derecha'],
      ['below', 'Debajo'],
      ['none', 'Sin valor'],
    ], (z, v) => (z.valuePosition = v))}
    <label class="check">
      <input
        type="checkbox"
        checked={!!zone.showIfMissing}
        onchange={(e) => edit('showIfMissing', (z) => (z.showIfMissing = e.currentTarget.checked || undefined))}
      />
      Mostrar aunque la carta no lo tenga
    </label>
    {@render column('Columna CSV', zone.bind ?? 'atributos', 'bind', (z, v) => (z.bind = v || undefined))}
    <p class="hint">El valor sale de la celda de atributos: <code>{zone.key || 'clave'}:3</code></p>
    {@render fontEditor(zone.font)}
  {/if}
</div>

<style>
  .props {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .type {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .id {
    font-size: 15px;
    font-weight: 600;
  }
  h4 {
    margin: 10px 0 2px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .f {
    display: grid;
    grid-template-columns: 88px 1fr;
    align-items: center;
    gap: 6px;
  }
  .f > span:first-child {
    color: var(--muted);
  }
  .f input,
  .f select,
  .f textarea {
    width: 100%;
    min-width: 0;
    padding: 3px 6px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
  }
  .grid2 .f {
    grid-template-columns: auto 1fr;
  }
  .unit {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .unit small {
    color: var(--muted);
    width: 18px;
  }
  .color {
    display: flex;
    gap: 4px;
  }
  .color input[type='color'] {
    width: 30px;
    flex: none;
    padding: 1px;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .hint {
    color: var(--muted);
    margin: 0;
    font-size: 11px;
  }
  .warn {
    color: var(--warn);
  }
</style>
