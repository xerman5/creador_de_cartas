<script lang="ts">
  import { RESOURCE_FILE, shelfOf, SHELVES, type ShelfId } from '../core/wizard/resources';
  import ResourceShelf from './ResourceShelf.svelte';
  import ResourceSlot from './ResourceSlot.svelte';
  import { thumbUrls } from './thumbs.svelte';
  import type { Workspace } from './workspace.svelte';

  let {
    ws,
    value,
    onchange,
    subdir = 'iconos',
    placeholder = 'ruta dentro de assets/',
  }: {
    ws: Workspace;
    value: string | undefined;
    onchange: (value: string) => void;
    /** Estante (carpeta dentro de assets/) donde se copian las imágenes nuevas y que se abre primero. */
    subdir?: ShelfId;
    placeholder?: string;
  } = $props();

  const listId = `assets-${Math.random().toString(36).slice(2)}`;
  const images = $derived(ws.assetFiles.filter((f) => RESOURCE_FILE.test(f)));
  const writable = $derived(!!ws.source?.write);
  let thumb = $state('');
  let open = $state(false);
  let shelf = $state<ShelfId | null>(null);
  const current = $derived<ShelfId>(shelf ?? subdir);

  $effect(() => {
    const path = value;
    if (!path) thumb = '';
    else ws.lp?.assets.image(path).then((img) => path === value && (thumb = img?.src ?? ''));
  });

  const assets = $derived(ws.lp?.assets);
  const shelfPaths = $derived(open ? images.filter((p) => shelfOf(p) === current) : []);
  const thumbs = thumbUrls(() => ({ assets, paths: shelfPaths }));

  async function add(files: File[], to: ShelfId) {
    const [path] = await ws.addResources(files, to);
    if (path) {
      onchange(path);
      open = false;
    }
  }
</script>

<div class="asset">
  <ResourceSlot
    url={thumb || undefined}
    label={value || 'imagen'}
    custom={!!value}
    active={open}
    size={28}
    onclick={() => (open = !open)}
    onfile={(f) => writable && add([f], subdir)}
    onpath={(p) => onchange(p)}
  />
  <input
    type="text"
    list={listId}
    {placeholder}
    value={value ?? ''}
    onchange={(e) => onchange(e.currentTarget.value.trim())}
  />
  <datalist id={listId}>
    {#each images as f}<option value={f}></option>{/each}
  </datalist>
</div>
{#if open}
  <div class="picker">
    <div class="tabs">
      {#each SHELVES as s}
        <button class:active={current === s.id} onclick={() => (shelf = s.id)}>{s.label}</button>
      {/each}
      <span class="grow"></span>
      {#if value}<button class="ghost" onclick={() => { onchange(''); open = false; }}>Quitar</button>{/if}
      <button class="ghost" onclick={() => (open = false)} aria-label="Cerrar">✕</button>
    </div>
    <ResourceShelf
      compact
      items={shelfPaths.map((path) => ({ path, url: thumbs.urls.get(path) ?? '' })).filter((it) => it.url)}
      selected={value ?? ''}
      onpick={(p) => {
        onchange(p);
        open = false;
      }}
      onadd={writable ? (files) => add(files, current) : undefined}
      empty={writable ? 'Vacío: suelta aquí una imagen o pulsa «Añadir».' : 'Vacío.'}
    />
  </div>
{/if}

<style>
  .asset {
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 0;
  }
  .asset input[type='text'] {
    flex: 1;
    min-width: 0;
  }
  .picker {
    margin: 6px 0 4px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 6px;
    align-items: center;
  }
  .tabs button {
    padding: 2px 8px;
    font-size: 12px;
  }
  .tabs button.active {
    background: #2f3440;
    border-color: var(--accent);
  }
  .grow {
    flex: 1;
  }
</style>
