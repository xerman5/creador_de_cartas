<script lang="ts">
  import Papa from 'papaparse';
  import { BLEED_MM, cardPixels } from '../core/card';
  import { downloadBlob } from '../core/export';
  import { hasColumn, templateColumns } from '../core/project';
  import { normalizeKey } from '../core/text';
  import type { CardSize, Project } from '../core/types';
  import { CARD_PRESETS } from '../core/zones';
  import AssetField from './AssetField.svelte';
  import type { Workspace } from './workspace.svelte';

  let { ws, onedit }: { ws: Workspace; onedit: (tipo: string) => void } = $props();

  const lp = $derived(ws.lp!);
  const project = $derived(lp.project);
  const preset = $derived(
    CARD_PRESETS.find((p) => p.width === project.card.width && p.height === project.card.height)?.name ?? '',
  );

  const px300 = $derived(cardPixels(project.card, 300));

  const csvTipos =$derived([...new Set(lp.rows.map((r) => normalizeKey(r.tipo ?? '')).filter(Boolean))]);
  const tipos = $derived([...new Set([...Object.keys(project.templates), ...csvTipos])]);
  const count = (t: string) => lp.rows.filter((r) => normalizeKey(r.tipo ?? '') === t).length;
  const langs = $derived(lp.langs.length ? lp.langs : ['es', 'en']);

  /** Columnas que faltan en el CSV para las plantillas actuales. */
  const missing = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const [tipo, tpl] of Object.entries(project.templates)) {
      for (const col of templateColumns(tpl)) {
        if (hasColumn(lp.columns, col)) continue;
        const names = col.localized ? langs.map((l) => `${col.name}-${l}`) : [col.name];
        for (const n of names) out.set(n, [...(out.get(n) ?? []), tipo]);
      }
    }
    return out;
  });

  function set(key: string, fn: (p: Project) => void) {
    ws.update(fn, { coalesce: `project/${key}` });
  }

  const num = (e: Event) => (e.currentTarget as HTMLInputElement).valueAsNumber;
  const str = (e: Event) => (e.currentTarget as HTMLInputElement).value;

  function setCard(key: keyof CardSize, e: Event) {
    const v = num(e);
    if (!Number.isNaN(v)) set(`card.${key}`, (p) => (p.card[key] = v));
  }

  function applyPreset(name: string) {
    const p = CARD_PRESETS.find((c) => c.name === name);
    if (p) ws.update((pr) => Object.assign(pr.card, { width: p.width, height: p.height }));
  }

  function addTemplate(tipo: string) {
    ws.update((p) => (p.templates[tipo] = { zones: [] }));
    onedit(tipo);
  }

  // ------------------------------------------------------------ atributos

  function addAttribute() {
    const name = prompt('Nombre del atributo (p. ej. «fuerza»). Es lo que se escribe en el CSV: fuerza:3')?.trim();
    if (!name) return;
    const key = normalizeKey(name);
    if (project.attributes[key]) return;
    ws.update((p) => (p.attributes[key] = { icon: `iconos/${key}.png`, label: name }));
  }

  function renameAttribute(oldKey: string, name: string) {
    const key = normalizeKey(name);
    if (!key || key === oldKey || project.attributes[key]) return;
    ws.update((p) => {
      p.attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k === oldKey ? key : k, v]));
      for (const tpl of Object.values(p.templates)) {
        for (const z of tpl.zones) {
          if (z.type === 'attribute' && normalizeKey(z.key) === oldKey) z.key = key;
          if (z.type === 'attributes' && z.keys) z.keys = z.keys.map((k) => (normalizeKey(k) === oldKey ? key : k));
        }
      }
    });
  }

  function deleteAttribute(key: string) {
    ws.update((p) => delete p.attributes[key]);
  }

  // ------------------------------------------------------------ CSV

  /** Descarga el CSV actual con las columnas que faltan añadidas (vacías). */
  function downloadCsvWithColumns() {
    const fields = [...lp.columns, ...missing.keys()];
    if (!fields.includes('id')) fields.unshift('id');
    if (!fields.includes('tipo')) fields.splice(1, 0, 'tipo');
    const csv = Papa.unparse({ fields, data: lp.rows.map((r) => fields.map((f) => r[f] ?? '')) });
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), project.csv.split('/').pop() ?? 'cartas.csv');
  }
</script>

<div class="settings">
  <section>
    <h2>1 · Proyecto</h2>
    <div class="fields">
      <label class="f">
        <span>Nombre</span>
        <input type="text" value={project.name} onchange={(e) => set('name', (p) => (p.name = str(e)))} />
      </label>
      <label class="f">
        <span>Archivo CSV</span>
        <input type="text" value={project.csv} onchange={(e) => set('csv', (p) => (p.csv = str(e).trim()))} />
      </label>
      <label class="f">
        <span>Carpeta de recursos</span>
        <input type="text" value={project.assetsDir} onchange={(e) => set('assetsDir', (p) => (p.assetsDir = str(e).trim()))} />
      </label>
    </div>
  </section>

  <section>
    <h2>2 · Tamaño de carta</h2>
    <div class="fields">
      <label class="f">
        <span>Formato</span>
        <select value={preset} onchange={(e) => applyPreset(str(e))}>
          {#each CARD_PRESETS as p}<option value={p.name}>{p.name} ({p.width}×{p.height} mm)</option>{/each}
          <option value="">Personalizado</option>
        </select>
      </label>
      <div class="grid4">
        <label class="f"><span>Ancho</span><input type="number" step="0.5" value={project.card.width} onchange={(e) => setCard('width', e)} /></label>
        <label class="f"><span>Alto</span><input type="number" step="0.5" value={project.card.height} onchange={(e) => setCard('height', e)} /></label>
        <label class="f"><span>Sangrado</span><input type="number" value={BLEED_MM} disabled title="Fijo en todo el sistema" /></label>
        <label class="f"><span>Margen seguridad</span><input type="number" step="0.5" min="0" value={project.card.safe ?? 0} onchange={(e) => setCard('safe', e)} /></label>
      </div>
      <p class="hint">
        Medidas del corte en mm. El sangrado es fijo de {BLEED_MM} mm por lado. La franja entre el corte y el margen de
        seguridad es la <strong>zona peligrosa</strong>: los textos no deben entrar en ella.<br />
        Exportando a 300 ppp: {px300.width} × {px300.height} px ({px300.trimWidth} × {px300.trimHeight} al corte + {px300.bleed} px de
        sangrado por lado).
      </p>
    </div>
  </section>

  <section>
    <h2>3 · Tipos de carta</h2>
    <table>
      <thead><tr><th>Tipo</th><th>Cartas en CSV</th><th>Plantilla</th><th></th></tr></thead>
      <tbody>
        {#each tipos as t}
          <tr>
            <td><strong>{t}</strong></td>
            <td>{count(t)}</td>
            <td>
              {#if project.templates[t]}
                {project.templates[t].zones.length} zonas
              {:else}
                <span class="warn">sin plantilla</span>
              {/if}
            </td>
            <td class="actions">
              {#if project.templates[t]}
                <button class="small" onclick={() => onedit(t)}>Editar anatomía →</button>
              {:else}
                <button class="small primary" onclick={() => addTemplate(t)}>Crear plantilla</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="hint">Los tipos salen de la columna «tipo» del CSV. También puedes crearlos desde la pestaña Plantillas.</p>
  </section>

  <section>
    <div class="head">
      <h2>4 · Atributos</h2>
      <button class="small" onclick={addAttribute}>＋ Atributo</button>
    </div>
    {#if Object.keys(project.attributes).length}
      <table>
        <thead><tr><th>Clave (CSV)</th><th>Nombre</th><th>Icono</th><th></th></tr></thead>
        <tbody>
          {#each Object.entries(project.attributes) as [key, def] (key)}
            <tr>
              <td><input class="key" type="text" value={key} onchange={(e) => renameAttribute(key, str(e))} /></td>
              <td>
                <input
                  type="text"
                  value={def.label ?? ''}
                  onchange={(e) => set(`attr/${key}/label`, (p) => (p.attributes[key].label = str(e) || undefined))}
                />
              </td>
              <td class="icon-cell">
                <AssetField {ws} value={def.icon} subdir="iconos" onchange={(v) => ws.update((p) => (p.attributes[key].icon = v))} />
              </td>
              <td><button class="small danger" onclick={() => deleteAttribute(key)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Aún no hay atributos.</p>
    {/if}
    <p class="hint">
      En el CSV: <code>fuerza:3 | velocidad:5</code>. En los textos: <code>{'{fuerza}'}</code> dibuja el icono.
    </p>
  </section>

  <section>
    <div class="head">
      <h2>5 · Fuentes</h2>
      <button class="small" onclick={() => ws.update((p) => p.fonts.push({ family: 'Mi fuente', file: 'fuentes/' }))}>＋ Fuente</button>
    </div>
    {#if project.fonts.length}
      <table>
        <thead><tr><th>Familia</th><th>Archivo (.ttf, .otf, .woff2)</th><th>Peso</th><th>Estilo</th><th></th></tr></thead>
        <tbody>
          {#each project.fonts as f, i (i)}
            <tr>
              <td><input type="text" value={f.family} onchange={(e) => set(`font/${i}/family`, (p) => (p.fonts[i].family = str(e)))} /></td>
              <td><input type="text" value={f.file} onchange={(e) => set(`font/${i}/file`, (p) => (p.fonts[i].file = str(e)))} /></td>
              <td>
                <select value={f.weight ?? 'normal'} onchange={(e) => set(`font/${i}/weight`, (p) => (p.fonts[i].weight = str(e)))}>
                  <option value="normal">normal</option>
                  <option value="bold">negrita</option>
                </select>
              </td>
              <td>
                <select value={f.style ?? 'normal'} onchange={(e) => set(`font/${i}/style`, (p) => (p.fonts[i].style = str(e)))}>
                  <option value="normal">normal</option>
                  <option value="italic">cursiva</option>
                </select>
              </td>
              <td><button class="small danger" onclick={() => ws.update((p) => p.fonts.splice(i, 1))}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Se usan las fuentes del sistema. Añade aquí las tuyas (copia los archivos a {project.assetsDir}/fuentes/).</p>
    {/if}
  </section>

  <section>
    <h2>6 · Columnas del CSV</h2>
    {#if missing.size}
      <p>Las plantillas usan columnas que el CSV no tiene:</p>
      <ul class="cols">
        {#each [...missing] as [col, tpls]}<li><code>{col}</code> <span class="muted">({tpls.join(', ')})</span></li>{/each}
      </ul>
      <button class="primary" onclick={downloadCsvWithColumns}>Descargar el CSV con esas columnas añadidas</button>
      <p class="hint">Se descarga una copia con tus datos y las columnas nuevas vacías; sustituye la tuya cuando la revises.</p>
    {:else}
      <p class="muted">El CSV tiene todas las columnas que usan las plantillas.</p>
    {/if}
  </section>
</div>

<style>
  .settings {
    padding: 20px max(24px, calc(50% - 430px)) 60px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    overflow: auto;
    height: 100%;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .f {
    display: grid;
    grid-template-columns: 150px 1fr;
    align-items: center;
    gap: 8px;
    max-width: 520px;
  }
  .f > span {
    color: var(--muted);
  }
  .grid4 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    max-width: 520px;
  }
  .grid4 .f {
    grid-template-columns: auto 90px;
    justify-content: space-between;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: normal;
    font-size: 12px;
  }
  td input,
  td select {
    width: 100%;
    padding: 3px 6px;
  }
  .key {
    font-family: ui-monospace, monospace;
  }
  .icon-cell {
    min-width: 260px;
  }
  .actions {
    text-align: right;
  }
  button.small {
    padding: 2px 8px;
    font-size: 12px;
  }
  button.danger:hover {
    border-color: #c44;
    color: #f88;
  }
  .cols {
    margin: 0;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }
  .muted {
    color: var(--muted);
    margin: 0;
  }
  .warn {
    color: var(--warn);
  }
</style>
