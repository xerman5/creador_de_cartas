<script lang="ts">
  import { acceptsDrop, droppedFiles, droppedResource } from './drop';

  /**
   * Hueco para un recurso (el icono de un atributo, un fondo…): enseña el actual y acepta que le
   * suelten un archivo o una miniatura de la biblioteca. Con un clic, `onclick` (abrir la biblioteca).
   */
  let {
    url,
    label,
    active = false,
    custom = false,
    onfile,
    onpath,
    onclick,
    size = 34,
  }: {
    url: string | undefined;
    label: string;
    active?: boolean;
    /** Hay un recurso propio (no el provisional). */
    custom?: boolean;
    onfile: (file: File) => void;
    onpath: (path: string) => void;
    onclick?: () => void;
    size?: number;
  } = $props();

  let over = $state(false);

  async function drop(e: DragEvent) {
    over = false;
    e.preventDefault();
    const path = droppedResource(e);
    if (path) return onpath(path);
    const [file] = await droppedFiles(e);
    if (file) onfile(file);
  }
</script>

<button
  class="slot"
  class:over
  class:active
  class:custom
  style:width="{size}px"
  style:height="{size}px"
  title="{label}: suelta aquí una imagen o haz clic para elegirla"
  aria-label="Icono de {label}"
  onclick={onclick}
  ondragover={(e) => {
    if (acceptsDrop(e)) {
      e.preventDefault();
      over = true;
    }
  }}
  ondragleave={() => (over = false)}
  ondrop={drop}
>
  {#if url}<img src={url} alt="" />{:else}?{/if}
</button>

<style>
  .slot {
    flex: none;
    padding: 2px;
    border-radius: 6px;
    border: 1px dashed var(--border);
    background: #2b2f38 repeating-conic-gradient(#343945 0 25%, transparent 0 50%) 0 0 / 8px 8px;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .slot.custom {
    border-style: solid;
  }
  .slot.over,
  .slot.active {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
</style>
