<script lang="ts">
  import { BLEED_MM } from '../core/card';
  import { planExport } from '../core/deck';
  import { exportFiles, exportSettings, saveToFolder, saveZip, slug, type ExportOptions } from '../core/export';
  import type { ExportSettings } from '../core/types';
  import { projectIssues } from '../core/project';
  import type { RenderOptions } from '../core/render';
  import { normalizeKey } from '../core/text';
  import type { CardRow } from '../core/types';
  import CardDetail from './CardDetail.svelte';
  import CardView from './CardView.svelte';
  import type { Workspace } from './workspace.svelte';

  let { ws }: { ws: Workspace } = $props();

  const SIZES = { S: 150, M: 210, L: 300 };
  type Entry = { row: CardRow; index: number };

  const lp = $derived(ws.lp!);
  let showBleed = $state(true);
  let showGuides = $state(false);
  let showZones = $state(false);
  let thumb = $state<keyof typeof SIZES>('M');
  let tipoFilter = $state('');
  let search = $state('');
  let selected = $state<number | null>(null);
  let destination = $state<'zip' | 'folder'>('zip');
  let progress = $state('');
  let notice = $state('');
  let abort: AbortController | null = null;
  let warnings = $state<Record<number, string[]>>({});

  const previewOpts = $derived.by<RenderOptions>(() => {
    const card = lp.project.card;
    const widthMm = card.width + (showBleed ? 2 * BLEED_MM : 0);
    const dpi = (SIZES[thumb] * (window.devicePixelRatio || 1) * 25.4) / widthMm;
    return { dpi, lang: ws.lang, bleed: showBleed, guides: showGuides, zones: showZones };
  });

  const tipoOf = (row: CardRow) => row.tipo?.trim() || '(sin tipo)';
  const tipos = $derived([...new Set(lp.rows.map(tipoOf))]);

  const visible = $derived.by<Entry[]>(() => {
    const q = normalizeKey(search);
    return lp.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !tipoFilter || tipoOf(row) === tipoFilter)
      .filter(({ row }) => !q || Object.values(row).some((v) => normalizeKey(v).includes(q)));
  });

  const groups = $derived.by(() => {
    const map = new Map<string, Entry[]>();
    for (const e of visible) map.set(tipoOf(e.row), [...(map.get(tipoOf(e.row)) ?? []), e]);
    return [...map];
  });

  const settings = $derived(exportSettings(lp.project));
  const exportOpts = $derived<ExportOptions>({
    dpi: settings.dpi,
    lang: ws.lang,
    format: settings.format,
    quality: settings.quality / 100,
    langSuffix: lp.langs.length > 1,
  });
  const canFolder = $derived(!!ws.source?.write);
  const folderDir = $derived(lp.langs.length > 1 && ws.lang ? `export/${ws.lang}` : 'export');

  function setExport<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) {
    ws.update((p) => void (p.export = { ...exportSettings(p), [key]: value }), { coalesce: `export/${key}` });
  }
  const plan = $derived(planExport(lp.rows, visible.map((e) => e.index), lp.project));
  const totalCopies = $derived(plan.fronts.reduce((s, f) => s + f.copies, 0));
  const imageCount = $derived(plan.fronts.length + plan.backs.length);

  const issues = $derived([...lp.errors, ...projectIssues(lp)]);
  const allWarnings = $derived([
    ...plan.warnings.map((w) => ({ index: w.index, id: lp.rows[w.index]?.id ?? '', w: w.message })),
    ...Object.entries(warnings).flatMap(([i, ws]) => ws.map((w) => ({ index: +i, id: lp.rows[+i]?.id ?? '', w }))),
  ]);

  // Si cambian las filas (recarga), los avisos antiguos ya no corresponden.
  $effect(() => {
    lp.rows;
    warnings = {};
  });

  async function exportVisible() {
    if (progress) return;
    abort = new AbortController();
    const signal = abort.signal;
    const toFolder = destination === 'folder' && canFolder;
    const started = performance.now();
    progress = `0 / ${imageCount}`;
    notice = '';
    try {
      const files = exportFiles(plan, lp, exportOpts, (n, total) => (progress = `${n} / ${total}`), signal);
      if (toFolder) await saveToFolder(files, ws.source!, folderDir, signal);
      else {
        const suffix = [tipoFilter, ws.lang].filter(Boolean).map(slug).join('_');
        if (!(await saveZip(files, `${slug(lp.project.name)}${suffix ? `_${suffix}` : ''}.zip`, signal))) return;
      }
      const secs = Math.round((performance.now() - started) / 1000);
      notice = `${imageCount} imágenes exportadas${toFolder ? ` en ${folderDir}/` : ''} (${secs} s).`;
    } catch (e) {
      if (signal.aborted) notice = 'Exportación cancelada.';
      else ws.error = e instanceof Error ? e.message : String(e);
    } finally {
      progress = '';
      abort = null;
    }
  }
</script>

<div class="layout">
  <aside>
    <section>
      <h3>{lp.project.name}</h3>
      <p class="muted">
        {ws.source?.label} · {lp.rows.length} cartas<br />
        {lp.project.card.width}×{lp.project.card.height} mm + {BLEED_MM} mm de sangrado
      </p>
    </section>

    <section>
      <h4>Exportar</h4>
      <div class="row">
        <select id="export-format" value={settings.format} onchange={(e) => setExport('format', e.currentTarget.value as ExportSettings['format'])}>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
        <label class="inline">
          <input id="export-dpi" type="number" min="72" max="1200" step="1" value={settings.dpi} onchange={(e) => setExport('dpi', e.currentTarget.valueAsNumber)} /> ppp
        </label>
        {#if settings.format === 'jpg'}
          <label class="inline" title="Calidad JPG">
            <input id="export-quality" type="number" min="50" max="100" step="1" value={settings.quality} onchange={(e) => setExport('quality', e.currentTarget.valueAsNumber)} /> %
          </label>
        {/if}
      </div>
      {#if canFolder}
        <select id="export-destination" bind:value={destination}>
          <option value="zip">Descargar .zip</option>
          <option value="folder">Carpeta del proyecto ({folderDir}/)</option>
        </select>
      {/if}
      {#if progress}
        <div class="row">
          <button class="primary grow" disabled>Exportando {progress}</button>
          <button onclick={() => abort?.abort()}>Cancelar</button>
        </div>
      {:else}
        <button class="primary" onclick={exportVisible} disabled={!imageCount}>
          Exportar {plan.fronts.length} cartas + {plan.backs.length} traseras
        </button>
      {/if}
      <p class="muted small">
        {totalCopies} copias en total · {imageCount} imágenes y <code>manifest.json</code><br />
        Sangrado de 3 mm incluido · los ajustes se guardan en el proyecto
      </p>
      {#if notice}<p class="small ok">{notice}</p>{/if}
    </section>

    <section>
      <h4>Filtrar</h4>
      <select bind:value={tipoFilter}>
        <option value="">Todos los tipos</option>
        {#each tipos as t}<option value={t}>{t}</option>{/each}
      </select>
      <input type="search" placeholder="Buscar…" bind:value={search} />
    </section>

    <section>
      <h4>Vista</h4>
      <label class="check"><input type="checkbox" bind:checked={showBleed} /> Mostrar sangrado</label>
      <label class="check"><input type="checkbox" bind:checked={showGuides} /> Corte, zona peligrosa y seguridad</label>
      <label class="check"><input type="checkbox" bind:checked={showZones} /> Contorno de zonas</label>
      <div class="seg">
        {#each Object.keys(SIZES) as s}
          <button class:active={thumb === s} onclick={() => (thumb = s as keyof typeof SIZES)}>{s}</button>
        {/each}
      </div>
    </section>

    {#if issues.length || allWarnings.length}
      <section>
        <h4 class="warn">Avisos ({issues.length + allWarnings.length})</h4>
        <ul class="warnings">
          {#each issues as e}<li>{e}</li>{/each}
          {#each allWarnings as w}
            <li>
              <button class="link" onclick={() => (selected = w.index)}>{w.id || `fila ${w.index + 1}`}</button>: {w.w}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>

  <main>
    {#each groups as [tipo, entries] (tipo)}
      <section class="group">
        <h2>{tipo} <small>{entries.length}</small></h2>
        <div class="grid">
          {#each entries as e (e.index)}
            <button class="thumb" onclick={() => (selected = e.index)}>
              <CardView row={e.row} {lp} opts={previewOpts} onwarnings={(w) => (warnings[e.index] = w)} />
              <span class="cap">
                {e.row.id || `fila ${e.index + 1}`}
                {#if warnings[e.index]?.length}<span class="badge">⚠ {warnings[e.index].length}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <p class="muted">No hay cartas que mostrar.</p>
    {/each}
  </main>
</div>

{#if selected !== null && selected < lp.rows.length}
  <CardDetail
    {lp}
    index={selected}
    opts={previewOpts}
    {exportOpts}
    onclose={() => (selected = null)}
    onselect={(i) => (selected = i)}
  />
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    height: 100%;
  }
  aside {
    border-right: 1px solid var(--border);
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    font-size: 13px;
    overflow: auto;
  }
  aside section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  aside h3,
  aside h4 {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
  }
  .inline input {
    width: 70px;
  }
  .seg {
    display: flex;
  }
  .seg button {
    flex: 1;
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .seg button.active {
    background: var(--accent);
    color: #fff;
  }
  .grow {
    flex: 1;
  }
  .ok {
    color: var(--muted);
  }
  .small {
    font-size: 11px;
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .warnings {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 40vh;
    overflow: auto;
    color: var(--warn);
  }
  .link {
    all: unset;
    cursor: pointer;
    text-decoration: underline;
    font-weight: 600;
  }
  main {
    padding: 12px 20px 40px;
    overflow: auto;
  }
  .group h2 {
    font-size: 15px;
    text-transform: capitalize;
    margin: 12px 0;
  }
  .group h2 small {
    color: var(--muted);
    font-weight: normal;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }
  .thumb {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .thumb:hover :global(canvas),
  .thumb:focus-visible :global(canvas) {
    outline: 2px solid var(--accent);
  }
  .cap {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }
  .badge {
    color: var(--warn);
  }
  @media (max-width: 700px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
