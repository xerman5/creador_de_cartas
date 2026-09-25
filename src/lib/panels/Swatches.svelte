<script lang="ts">
  import type { Palette, PieceColor } from '../../core/wizard/answers';

  /** Los cuatro colores de la paleta (y «transparente»), como muestras que se pulsan. */
  let {
    value,
    label,
    palette,
    none = true,
    onpick,
  }: { value: string | undefined; label: string; palette: Palette; none?: boolean; onpick: (c: PieceColor) => void } = $props();

  const COLORS: [PieceColor, string][] = [
    ['principal', 'Principal'],
    ['acento', 'Acento'],
    ['papel', 'Papel'],
    ['tinta', 'Tinta'],
    ['none', 'Transparente'],
  ];
</script>

<div class="swatches">
  {#each COLORS.filter(([c]) => none || c !== 'none') as [c, name]}
    <button
      class="sw"
      class:active={value === c}
      class:none={c === 'none'}
      title={name}
      aria-label="{label}: {name}"
      style:background={c === 'none' ? undefined : palette[c]}
      onclick={() => onpick(c)}
    ></button>
  {/each}
</div>

<style>
  .swatches {
    display: flex;
    gap: 4px;
  }
  .sw {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 5px;
    border: 2px solid var(--border);
  }
  .sw.none {
    background: repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 8px 8px;
  }
  .sw.active {
    border-color: #fff;
    outline: 2px solid var(--accent);
  }
</style>
