<script lang="ts">
  /**
   * Color de una zona del editor: los colores con nombre del proyecto (paleta, rareza…), transparente
   * si se permite, o uno cualquiera con el selector.
   */
  let {
    value,
    label,
    colors,
    none = false,
    onchange,
  }: {
    value: string | undefined;
    label: string;
    /** Nombre → color CSS. */
    colors: Record<string, string>;
    none?: boolean;
    onchange: (value: string | undefined) => void;
  } = $props();

  const current = $derived((value ?? '').trim().toLowerCase());
  const hex = $derived.by(() => {
    const c = colors[current] ?? value ?? '';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
    return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : '#000000';
  });
</script>

<div class="colors">
  {#each Object.entries(colors) as [name, css]}
    <button class="sw" class:active={current === name} title={name} aria-label="{label}: {name}" style:background={css} onclick={() => onchange(name)}></button>
  {/each}
  {#if none}
    <button class="sw none" class:active={!value} title="Transparente" aria-label="{label}: Transparente" onclick={() => onchange(undefined)}></button>
  {/if}
  <input type="color" value={hex} title="Otro color" aria-label="{label}: otro color" oninput={(e) => onchange(e.currentTarget.value)} />
</div>

<style>
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
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
  input[type='color'] {
    width: 28px;
    height: 24px;
    padding: 0 2px;
  }
</style>
