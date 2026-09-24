<script lang="ts">
  import { BLEED_MM } from '../core/card';
  import { planExport } from '../core/deck';
  import { downloadBlob, exportZip, slug, type ExportFormat, type ExportOptions } from '../core/export';
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
  let exportFormat = $state<ExportFormat>('png');
  let exportDpi = $state(300);
  let exportQuality = $state(95);
  let progress = $state('');
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

  const exportOpts = $derived<ExportOptions>({
    dpi: Math.max(72, Math.round(exportDpi || 300)),
    lang: ws.lang,
    format: exportFormat,
    quality: Math.min(100, Math.max(50, exportQuality || 95)) / 100,
    langSuffix: lp.langs.length > 1,
  });
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
    progress = `0 / ${imageCount}`;
    try {
      const zip = await exportZip(plan, lp, exportOpts, (n, total) => (progress = `${n} / ${total}`));
      const suffix = [tipoFilter, ws.lang].filter(Boolean).map(slug).join('_');
      downloadBlob(zip, `${slug(lp.project.name)}${suffix ? `_${suffix}` : ''}.zip`);
    } catch (e) {
      ws.error = e instanceof Error ? e.message : String(e);
    } finally {
      progress = '';
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
        <select bind:value={exportFormat}>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
        <label class="inline"><input type="number" min="72" max="1200" step="1" bind:value={exportDpi} /> ppp</label>
        {#if exportFormat === 'jpg'}
          <label class="inline" title="Calidad JPG"><input type="number" min="50" max="100" step="1" bind:value={exportQuality} /> %</label>
        {/if}
      </div>
      <button class="primary" onclick={exportVisible} disabled={!!progress || !imageCount}>
        {progress ? `Exportando ${progress}` : `Exportar ${plan.fronts.length} cartas + ${plan.backs.length} traseras`}
      </button>
      <p class="muted small">
        {totalCopies} copias en total · .zip con {imageCount} imágenes y <code>manifest.json</code><br />
        Sangrado de 3 mm incluido
      </p>
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
