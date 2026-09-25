<script lang="ts">
  import type { LoadedProject } from '../core/project';
  import type { CardRow } from '../core/types';

  /**
   * La imagen de referencia de una carta (columna «referencia»): un boceto que se ve al lado de la
   * carta mientras se diseña. Nunca se dibuja en la carta ni se exporta.
   */
  let { lp, row, column = 'referencia', width }: { lp: LoadedProject; row: CardRow | null | undefined; column?: string; width?: number } = $props();

  let src = $state('');
  $effect(() => {
    const path = row?.[column]?.trim();
    if (!path) return void (src = '');
    let cancelled = false;
    lp.assets.image(path).then((img) => !cancelled && (src = img?.src ?? ''));
    return () => (cancelled = true);
  });
</script>

{#if src}
  <figure class="ref" style:width={width ? `${width}px` : undefined}>
    <img {src} alt="Referencia de {row?.id ?? 'la carta'}" />
    <figcaption>Referencia</figcaption>
  </figure>
{/if}

<style>
  .ref {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: none;
  }
  img {
    max-width: 100%;
    max-height: 70vh;
    border-radius: 6px;
    outline: 1px dashed var(--border);
  }
  figcaption {
    font-size: 11px;
    color: var(--muted);
  }
</style>
