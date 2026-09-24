<script lang="ts">
  import { backRef, copiesOf } from '../core/deck';
  import { cardBlob, cardFileName, downloadBlob, type ExportFormat, type ExportOptions } from '../core/export';
  import type { LoadedProject } from '../core/project';
  import type { RenderOptions } from '../core/render';
  import CardView from './CardView.svelte';

  let {
    lp,
    index,
    opts,
    exportOpts,
    onclose,
    onselect,
  }: {
    lp: LoadedProject;
    index: number;
    opts: RenderOptions;
    exportOpts: ExportOptions;
    onclose: () => void;
    onselect: (index: number) => void;
  } = $props();

  const row = $derived(lp.rows[index]);
  const back = $derived(backRef(row, lp.project));
  const backIndex = $derived(back ? lp.rows.findIndex((r) => r.id?.trim() === back) : -1);
  const copies = $derived(copiesOf(row).copies);
  const fields = $derived(Object.entries(row).filter(([, v]) => v.trim() !== ''));
  const detailOpts = $derived({ ...opts, dpi: opts.dpi * 1.8 });

  let warnings = $state<string[]>([]);
  let busy = $state(false);

  async function save(format: ExportFormat) {
    busy = true;
    try {
      const eo = { ...exportOpts, format };
      downloadBlob(await cardBlob(row, lp, eo), cardFileName(row, index, eo));
    } finally {
      busy = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowRight' && index < lp.rows.length - 1) onselect(index + 1);
    else if (e.key === 'ArrowLeft' && index > 0) onselect(index - 1);
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{row.id || `Fila ${index + 1}`} <small>{row.tipo} · {copies} {copies === 1 ? 'copia' : 'copias'}</small></h2>
      <div class="actions">
        <button disabled={busy} onclick={() => save('png')}>Descargar PNG</button>
        <button disabled={busy} onclick={() => save('jpg')}>Descargar JPG</button>
        <button class="ghost" onclick={onclose} aria-label="Cerrar">✕</button>
      </div>
    </header>

    <div class="content">
      <div class="faces">
        <figure>
          <CardView {row} {lp} opts={detailOpts} onwarnings={(w) => (warnings = w)} />
          <figcaption>Anverso</figcaption>
        </figure>
        {#if backIndex >= 0}
          <figure>
            <button class="plain" onclick={() => onselect(backIndex)} title="Ir a la trasera">
              <CardView row={lp.rows[backIndex]} {lp} opts={detailOpts} />
            </button>
            <figcaption>Trasera: {lp.rows[backIndex].id}{row.trasera?.trim() ? '' : ' (de la plantilla)'}</figcaption>
          </figure>
        {:else if back}
          <p class="warn">La trasera «{back}» no existe en el CSV.</p>
        {/if}
      </div>

      <div class="side">
        {#if warnings.length}
          <ul class="warnings">
            {#each warnings as w}<li>⚠ {w}</li>{/each}
          </ul>
        {/if}
        <table>
          <tbody>
            {#each fields as [key, value]}
              <tr><th>{key}</th><td>{value}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="hint">← → para navegar · Esc para cerrar</p>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.7);
    display: grid;
    place-items: center;
    z-index: 10;
    padding: 16px;
  }
  .dialog {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    max-width: min(1200px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 16px 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  h2 small {
    color: var(--muted);
    font-weight: normal;
    margin-left: 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .content {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .faces {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  figure {
    margin: 0;
  }
  figcaption {
    color: var(--muted);
    font-size: 12px;
    margin-top: 6px;
    text-align: center;
  }
  .plain {
    all: unset;
    cursor: pointer;
  }
  .side {
    flex: 1;
    min-width: 260px;
    max-width: 420px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: normal;
    white-space: nowrap;
  }
  td {
    word-break: break-word;
  }
  .warnings {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
    color: var(--warn);
    font-size: 13px;
  }
  .warn {
    color: var(--warn);
  }
  .hint {
    color: var(--muted);
    font-size: 11px;
  }
</style>
