<script lang="ts">
  import { parseAttributes } from '../core/attributes';
  import { templateFor } from '../core/render';
  import { columnInfo, nextId, setAttribute } from '../core/table';
  import { getField, normalizeKey } from '../core/text';
  import type { CardRow, ImageZone } from '../core/types';
  import { RESOURCE_FILE } from '../core/wizard/resources';
  import CardView from './CardView.svelte';
  import CropEditor from './CropEditor.svelte';
  import type { Workspace } from './workspace.svelte';

  /** La tabla de cartas (el CSV) editable, con la carta seleccionada dibujada al lado. */
  let { ws }: { ws: Workspace } = $props();

  const lp = $derived(ws.lp!);
  const writable = $derived(!!ws.source?.write);
  let tipoFilter = $state('');
  let search = $state('');
  let selected = $state<number | null>(null);

  const tipos = $derived([...new Set(lp.rows.map((r) => r.tipo?.trim() || ''))].filter(Boolean));
  const templates = $derived(Object.keys(lp.project.templates));
  const info = $derived(columnInfo(lp.project, lp.columns));
  const images = $derived(ws.assetFiles.filter((f) => RESOURCE_FILE.test(f)));
  const ids = $derived.by(() => {
    const count = new Map<string, number>();
    for (const r of lp.rows) if (r.id?.trim()) count.set(r.id.trim(), (count.get(r.id.trim()) ?? 0) + 1);
    return count;
  });

  const visible = $derived.by(() => {
    const q = normalizeKey(search);
    return lp.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !tipoFilter || normalizeKey(row.tipo ?? '') === normalizeKey(tipoFilter))
      .filter(({ row }) => !q || Object.values(row).some((v) => normalizeKey(v).includes(q)));
  });

  const current = $derived(selected !== null && selected < lp.rows.length ? lp.rows[selected] : null);

  function setCell(index: number, col: string, value: string) {
    ws.updateRows((rows) => (rows[index] = { ...rows[index], [col]: value }), { coalesce: `celda/${index}/${col}` });
  }

  function addCard() {
    const tipo = (current?.tipo || tipoFilter || tipos[0] || templates[0] || '').trim();
    const at = selected !== null ? selected + 1 : lp.rows.length;
    ws.updateRows((rows, columns) => {
      const row: CardRow = Object.fromEntries(columns.map((c) => [c, '']));
      row.id = nextId(rows, tipo);
      row.tipo = tipo;
      rows.splice(at, 0, row);
    });
    selected = at;
  }

  function duplicate() {
    if (selected === null || !current) return;
    const at = selected + 1;
    ws.updateRows((rows) => rows.splice(at, 0, { ...current, id: nextId(rows, current.tipo ?? '') }));
    selected = at;
  }

  function remove() {
    if (selected === null || !current) return;
    if (!confirm(`¿Quitar la carta «${current.id || selected + 1}» de la tabla?`)) return;
    const at = selected;
    ws.updateRows((rows) => rows.splice(at, 1));
    selected = Math.min(at, lp.rows.length - 1);
  }

  function addColumn() {
    const name = normalizeKey(prompt('Nombre de la columna nueva (p. ej. «notas» o «titulo-en»):') ?? '');
    if (!name) return;
    if (lp.columns.includes(name)) return alert(`Ya hay una columna «${name}».`);
    ws.updateRows((rows, columns) => {
      columns.push(name);
      for (let i = 0; i < rows.length; i++) rows[i] = { ...rows[i], [name]: '' };
    });
  }

  // ---------------------------------------------------------- panel de la carta

  /** Zonas de imagen encuadrables de la carta seleccionada, con su imagen. */
  let crops = $state.raw<{ zone: ImageZone; column: string; src: string }[]>([]);
  $effect(() => {
    const row = current;
    const lpNow = lp;
    if (!row) return void (crops = []);
    const tpl = templateFor(lpNow.project, row);
    const zones = (tpl?.zones ?? []).filter((z): z is ImageZone => z.type === 'image' && !!z.cropBind && (z.fit ?? 'cover') === 'cover');
    let cancelled = false;
    Promise.all(
      zones.map(async (zone) => {
        const path = (zone.bind ? getField(row, zone.bind, ws.lang) : '') || zone.default;
        const img = path && path !== '-' ? await lpNow.assets.image(path) : null;
        return img ? { zone, column: normalizeKey(zone.cropBind!), src: img.src } : null;
      }),
    ).then((list) => {
      if (!cancelled) crops = list.filter((x) => x !== null);
    });
    return () => (cancelled = true);
  });

  const attrCol = $derived(lp.columns.find((c) => info[c]?.attributes) ?? 'atributos');
  const attrItems = $derived(current ? parseAttributes(current[attrCol] ?? '') : []);
  const opts = $derived({ dpi: 110, lang: ws.lang, bleed: false });
</script>

<div class="table-view">
  <main>
    <div class="toolbar">
      <select bind:value={tipoFilter} aria-label="Filtrar por tipo">
        <option value="">Todos los tipos</option>
        {#each tipos as t}<option value={t}>{t}</option>{/each}
      </select>
      <input type="search" placeholder="Buscar…" bind:value={search} />
      <span class="count">{visible.length} de {lp.rows.length}</span>
      <span class="grow"></span>
      <button class="small" onclick={addCard}>＋ Carta</button>
      <button class="small" onclick={duplicate} disabled={selected === null}>Duplicar</button>
      <button class="small" onclick={remove} disabled={selected === null}>Quitar</button>
      <button class="small ghost" onclick={addColumn}>＋ Columna</button>
    </div>
    {#if !writable}
      <p class="warn">Este proyecto no está abierto desde una carpeta con permiso de escritura: al guardar se descargará el CSV.</p>
    {/if}
    <div class="grid-wrap">
      <table>
        <thead>
          <tr>
            <th class="n">#</th>
            {#each lp.columns as c}<th class:long={info[c]?.long}>{c}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each visible as { row, index } (index)}
            <tr class:selected={index === selected} onfocusin={() => (selected = index)} onclick={() => (selected = index)}>
              <td class="n">{index + 1}</td>
              {#each lp.columns as c (c)}
                {@const v = row[c] ?? ''}
                <td class:long={info[c]?.long} class:dup={c === 'id' && (ids.get(v.trim()) ?? 0) > 1}>
                  {#if c === 'tipo'}
                    <select value={v} onchange={(e) => setCell(index, c, e.currentTarget.value)} aria-label="Tipo de la fila {index + 1}">
                      {#if v && !templates.includes(normalizeKey(v))}<option value={v}>{v} (sin plantilla)</option>{/if}
                      {#each tipos.concat(templates.filter((t) => !tipos.some((x) => normalizeKey(x) === t))) as t}
                        <option value={t}>{t}</option>
                      {/each}
                    </select>
                  {:else if info[c]?.long}
                    <textarea rows="2" value={v} oninput={(e) => setCell(index, c, e.currentTarget.value)} aria-label="{c}, fila {index + 1}"></textarea>
                  {:else}
                    <input
                      type="text"
                      value={v}
                      list={info[c]?.image ? 'tabla-imagenes' : undefined}
                      oninput={(e) => setCell(index, c, e.currentTarget.value)}
                      aria-label="{c}, fila {index + 1}"
                    />
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <datalist id="tabla-imagenes">{#each images as f}<option value={f}></option>{/each}</datalist>
    <p class="hint">
      Los cambios se guardan en el CSV con «Guardar» (⌘S) y se deshacen con ⌘Z. Un id repetido se marca en rojo. En los textos:
      <code>**negrita**</code>, <code>*cursiva*</code>, <code>{'{atributo}'}</code>.
    </p>
  </main>

  <aside>
    {#if current && selected !== null}
      <CardView row={current} {lp} {opts} />
      <p class="meta">{current.id || `Fila ${selected + 1}`} · {current.tipo}</p>

      {#if Object.keys(lp.project.attributes).length}
        <section>
          <h4>Atributos</h4>
          <p class="hint">Marca los que lleva; sin número, se dibuja solo el icono (una habilidad).</p>
          {#each Object.entries(lp.project.attributes) as [key, def]}
            {@const it = attrItems.find((x) => x.key === key)}
            <div class="attr">
              <label class="check">
                <input
                  type="checkbox"
                  checked={!!it}
                  onchange={(e) => setCell(selected!, attrCol, setAttribute(current[attrCol] ?? '', key, e.currentTarget.checked ? '' : null))}
                />
                {def.label || key}
              </label>
              <input
                type="text"
                value={it?.value ?? ''}
                disabled={!it}
                placeholder={it ? 'sin número' : ''}
                oninput={(e) => setCell(selected!, attrCol, setAttribute(current[attrCol] ?? '', key, e.currentTarget.value))}
                aria-label="Valor de {def.label || key}"
              />
            </div>
          {/each}
        </section>
      {/if}

      {#each crops as c (c.zone.id)}
        <section>
          <h4>Encuadre de «{c.zone.id}»</h4>
          {#if lp.columns.includes(c.column)}
            <CropEditor
              src={c.src}
              aspect={c.zone.rect.w / c.zone.rect.h}
              value={current[c.column]}
              onchange={(v) => setCell(selected!, c.column, v)}
              label="Encuadre de {c.zone.id}"
            />
            <p class="hint">Arrastra para mover la imagen; la rueda o el deslizador la amplían.</p>
          {:else}
            <p class="hint">
              Para encuadrar, añade al CSV la columna «{c.column}».
              <button class="small" onclick={() => ws.updateRows((rows, columns) => void columns.push(c.column))}>Añadirla</button>
            </p>
          {/if}
        </section>
      {/each}
    {:else}
      <p class="hint">Elige una fila para ver su carta, sus atributos y el encuadre de su ilustración.</p>
    {/if}
  </aside>
</div>

<style>
  .table-view {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    height: 100%;
    min-height: 0;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    min-width: 0;
    min-height: 0;
  }
  aside {
    border-left: 1px solid var(--border);
    padding: 12px 16px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  aside :global(canvas) {
    align-self: center;
  }
  .toolbar {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .count {
    color: var(--muted);
    font-size: 12px;
  }
  .grow {
    flex: 1;
  }
  .grid-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  table {
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--panel);
    z-index: 1;
    text-align: left;
    font-weight: normal;
    color: var(--muted);
    padding: 6px;
    white-space: nowrap;
  }
  td {
    padding: 2px;
    border-top: 1px solid var(--border);
    vertical-align: top;
  }
  td.n,
  th.n {
    color: var(--muted);
    text-align: right;
    padding: 6px;
    font-size: 11px;
  }
  tr.selected td {
    background: rgba(76, 125, 255, 0.12);
  }
  td input,
  td select {
    width: 150px;
  }
  td.long textarea {
    width: 260px;
    resize: vertical;
    font: inherit;
  }
  td.dup input {
    outline: 1px solid #e05252;
  }
  .meta {
    text-align: center;
    color: var(--muted);
    margin: 0;
    font-size: 12px;
  }
  h4 {
    margin: 4px 0;
  }
  section {
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  .attr {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 3px 0;
  }
  .attr .check {
    flex: 1;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .attr input[type='text'] {
    width: 80px;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }
  .warn {
    color: var(--warn);
    margin: 0;
  }
  button.small {
    padding: 3px 10px;
    font-size: 12px;
  }
</style>
