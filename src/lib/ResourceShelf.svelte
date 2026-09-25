<script lang="ts">
  import { stem } from '../core/wizard/resources';
  import { acceptsDrop, droppedFiles, RESOURCE_MIME } from './drop';

  /**
   * Un estante de la biblioteca: miniaturas que se pueden arrastrar a la carta o elegir con un clic,
   * y una zona donde soltar archivos o carpetas enteras.
   */
  let {
    items,
    selected = '',
    onpick,
    onadd,
    onremove,
    empty = 'Todavía no hay nada aquí.',
    compact = false,
  }: {
    items: { path: string; url: string }[];
    selected?: string;
    onpick?: (path: string) => void;
    onadd?: (files: File[]) => void;
    onremove?: (path: string) => void;
    empty?: string;
    compact?: boolean;
  } = $props();

  let over = $state(false);
  let input = $state<HTMLInputElement>();

  async function drop(e: DragEvent) {
    over = false;
    if (!onadd || ![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    const files = await droppedFiles(e);
    if (files.length) onadd(files);
  }
</script>

<div
  class="shelf"
  class:over
  class:compact
  role="list"
  ondragover={(e) => {
    if (onadd && acceptsDrop(e) && [...(e.dataTransfer?.types ?? [])].includes('Files')) {
      e.preventDefault();
      over = true;
    }
  }}
  ondragleave={() => (over = false)}
  ondrop={drop}
>
  {#each items as it (it.path)}
    <div class="item" class:selected={it.path === selected} role="listitem">
      <button
        class="thumb"
        draggable="true"
        title={onpick ? `Usar ${it.path}` : it.path}
        ondragstart={(e) => {
          e.dataTransfer?.setData(RESOURCE_MIME, it.path);
          e.dataTransfer?.setData('text/plain', it.path);
        }}
        onclick={() => onpick?.(it.path)}
        disabled={!onpick}
      >
        <img src={it.url} alt="" loading="lazy" />
      </button>
      <small title={it.path}>{stem(it.path)}</small>
      {#if onremove}<button class="remove ghost" title="Quitar de la biblioteca" aria-label="Quitar {stem(it.path)}" onclick={() => onremove(it.path)}>✕</button>{/if}
    </div>
  {:else}
    <p class="empty">{empty}</p>
  {/each}
  {#if onadd}
    <button class="add" onclick={() => input?.click()} title="Elegir archivos; también puedes soltarlos aquí, o una carpeta entera">
      ＋<small>Añadir</small>
    </button>
    <input
      type="file"
      accept="image/*,.svg"
      multiple
      hidden
      bind:this={input}
      onchange={(e) => {
        const files = [...(e.currentTarget.files ?? [])];
        e.currentTarget.value = '';
        if (files.length) onadd(files);
      }}
    />
  {/if}
</div>

<style>
  .shelf {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px;
    padding: 8px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    min-height: 70px;
  }
  .shelf.compact {
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  }
  .shelf.over {
    border-color: var(--accent);
    background: rgba(76, 125, 255, 0.08);
  }
  .item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .thumb,
  .add {
    width: 100%;
    aspect-ratio: 1;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #2b2f38 repeating-conic-gradient(#343945 0 25%, transparent 0 50%) 0 0 / 10px 10px;
    display: grid;
    place-items: center;
    cursor: grab;
  }
  .thumb:disabled {
    cursor: grab;
    opacity: 1;
  }
  .item.selected .thumb {
    outline: 2px solid var(--accent);
  }
  .thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .item small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 11px;
  }
  .remove {
    position: absolute;
    top: -6px;
    right: -6px;
    padding: 0 5px;
    font-size: 11px;
    line-height: 16px;
    border-radius: 8px;
    background: var(--panel);
    display: none;
  }
  .item:hover .remove,
  .remove:focus-visible {
    display: block;
  }
  .add {
    cursor: pointer;
    font-size: 20px;
    color: var(--muted);
    align-content: center;
    gap: 0;
    grid-template-rows: auto auto;
  }
  .add small {
    font-size: 11px;
  }
  .empty {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    align-self: center;
  }
</style>
