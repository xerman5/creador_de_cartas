<script lang="ts">
  import type { Workspace } from './workspace.svelte';

  let {
    ws,
    value,
    onchange,
    subdir = '',
    placeholder = 'ruta dentro de assets/',
  }: {
    ws: Workspace;
    value: string | undefined;
    onchange: (value: string) => void;
    /** Carpeta dentro de assets/ donde se copian las imágenes subidas. */
    subdir?: string;
    placeholder?: string;
  } = $props();

  const listId = `assets-${Math.random().toString(36).slice(2)}`;
  const images = $derived(ws.assetFiles.filter((f) => /\.(png|jpe?g|svg|webp|gif)$/i.test(f)));
  let thumb = $state('');
  let fileInput = $state<HTMLInputElement>();

  $effect(() => {
    const path = value;
    if (!path) thumb = '';
    else ws.lp?.assets.image(path).then((img) => path === value && (thumb = img?.src ?? ''));
  });

  async function upload() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    const path = await ws.importAsset(file, subdir);
    if (path) onchange(path);
  }
</script>

<div class="asset">
  <span class="thumb" class:missing={value && !thumb}>
    {#if thumb}<img src={thumb} alt="" />{:else if value}?{/if}
  </span>
  <input
    type="text"
    list={listId}
    {placeholder}
    value={value ?? ''}
    onchange={(e) => onchange(e.currentTarget.value.trim())}
  />
  {#if ws.source?.write}
    <button class="ghost" title="Copiar una imagen a assets/{subdir}" onclick={() => fileInput?.click()}>↥</button>
    <input type="file" accept="image/*" hidden bind:this={fileInput} onchange={upload} />
  {/if}
  <datalist id={listId}>
    {#each images as f}<option value={f}></option>{/each}
  </datalist>
</div>

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
  .thumb {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    background: #2b2f38 repeating-conic-gradient(#343945 0 25%, transparent 0 50%) 0 0 / 8px 8px;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: var(--warn);
    font-weight: bold;
  }
  .thumb.missing {
    outline: 1px solid var(--warn);
  }
  .thumb img {
    max-width: 100%;
    max-height: 100%;
  }
  button {
    padding: 4px 8px;
  }
</style>
