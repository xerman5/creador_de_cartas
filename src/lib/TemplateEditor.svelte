<script lang="ts">
  import { BLEED_MM, cardSizeFor, safeAreaIssues } from '../core/card';
  import { GUIDE_COLORS, placeholderRow, ZONE_COLORS } from '../core/render';
  import { normalizeKey } from '../core/text';
  import type { Rect, Zone, ZoneType } from '../core/types';
  import { newZone, uniqueId, ZONE_LABELS } from '../core/zones';
  import Stage from './Stage.svelte';
  import ZoneProps from './ZoneProps.svelte';
  import type { Workspace } from './workspace.svelte';

  let { ws, initialTipo = '' }: { ws: Workspace; initialTipo?: string } = $props();

  const PLACEHOLDER = '__ejemplo__';
  const ZONE_TYPES: ZoneType[] = ['image', 'text', 'attribute', 'attributes'];

  const lp = $derived(ws.lp!);
  const project = $derived(lp.project);
  const tipos = $derived(Object.keys(project.templates));

  // svelte-ignore state_referenced_locally
  let chosenTipo = $state(initialTipo);
  const tipo = $derived(tipos.includes(chosenTipo) ? chosenTipo : (tipos[0] ?? ''));
  const tpl = $derived(tipo ? project.templates[tipo] : undefined);

  let selectedRaw = $state<number | null>(null);
  const selected = $derived(selectedRaw !== null && tpl && selectedRaw < tpl.zones.length ? selectedRaw : null);

  const rowsOfTipo = $derived(lp.rows.filter((r) => normalizeKey(r.tipo ?? '') === tipo));
  let previewId = $state('');
  const previewRow = $derived.by(() => {
    if (previewId !== PLACEHOLDER) {
      const found = rowsOfTipo.find((r) => r.id === previewId) ?? rowsOfTipo[0];
      if (found) return found;
    }
    return placeholderRow(project, tipo);
  });

  const backCandidates = $derived(lp.rows.filter((r) => r.id?.trim() && normalizeKey(r.tipo ?? '') !== tipo));
  const columns = $derived([...new Set(lp.columns.map((c) => c.replace(/-[a-z]{2}$/, '')))]);
  const counts = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const r of lp.rows) m[normalizeKey(r.tipo ?? '')] = (m[normalizeKey(r.tipo ?? '')] ?? 0) + 1;
    return m;
  });

  // Zoom: null = ajustar al espacio disponible.
  let zoom = $state<number | null>(null);
  let viewW = $state(600);
  let viewH = $state(600);
  const size = $derived(cardSizeFor(project, tpl));
  const fitPxPerMm = $derived(
    Math.max(2, Math.min((viewW - 48) / (size.width + 2 * BLEED_MM), (viewH - 48) / (size.height + 2 * BLEED_MM))),
  );
  const pxPerMm = $derived(zoom ?? fitPxPerMm);

  /** Tipo de zona que se va a trazar sobre la carta. */
  let tool = $state<ZoneType | null>(null);
  let grid = $state(0.5);
  let showGuides = $state(true);
  let renderWarnings = $state<string[]>([]);
  const safeIssues = $derived(tpl ? safeAreaIssues(tpl, size) : []);
  const unsafe = $derived(new Set(safeIssues.map((i) => i.index)));
  const warnings = $derived([...safeIssues.map((i) => i.message), ...renderWarnings]);

  function selectTipo(t: string) {
    tool = null;
    chosenTipo = t;
    selectedRaw = null;
    previewId = '';
  }

  // ------------------------------------------------------------ plantillas

  function addTipo() {
    const name = prompt('Nombre del nuevo tipo de carta (el valor de la columna «tipo»):')?.trim();
    if (!name) return;
    const key = normalizeKey(name);
    if (project.templates[key]) return selectTipo(key);
    ws.update((p) => (p.templates[key] = { zones: [] }));
    selectTipo(key);
  }

  function duplicateTipo() {
    const name = prompt('Nombre del tipo copiado:', `${tipo} copia`)?.trim();
    if (!name || !tpl) return;
    const key = normalizeKey(name);
    ws.update((p) => (p.templates[key] = structuredClone(p.templates[tipo])));
    selectTipo(key);
  }

  function renameTipo() {
    const name = prompt(`Nuevo nombre para «${tipo}».\nLas cartas del CSV deben usar este nombre en la columna «tipo».`, tipo)?.trim();
    if (!name) return;
    const key = normalizeKey(name);
    if (key === tipo || project.templates[key]) return;
    ws.update((p) => {
      // Se reconstruye el objeto para conservar el orden de los tipos.
      p.templates = Object.fromEntries(Object.entries(p.templates).map(([k, v]) => [k === tipo ? key : k, v]));
    });
    selectTipo(key);
  }

  function deleteTipo() {
    if (!confirm(`¿Borrar la plantilla «${tipo}»? (se puede deshacer)`)) return;
    ws.update((p) => delete p.templates[tipo]);
    selectedRaw = null;
  }

  // ------------------------------------------------------------ zonas

  function zonesUpdate(fn: (zones: Zone[]) => void, coalesce?: string) {
    ws.update((p) => fn(p.templates[tipo].zones), { coalesce });
  }

  /** Con `rect` la zona ocupa lo trazado; si no, se crea con su tamaño por defecto centrada en `point`. */
  function addZone(type: ZoneType, rect: Rect | null, point: { x: number; y: number }) {
    if (!tpl) return;
    const zone = newZone(type, project, size, tpl.zones.map((z) => z.id));
    if (rect) zone.rect = rect;
    else {
      const { w, h } = zone.rect;
      const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max) * 2) / 2;
      zone.rect = { x: clamp(point.x - w / 2, size.width - w), y: clamp(point.y - h / 2, size.height - h), w, h };
    }
    // Lo nuevo va arriba del todo salvo las imágenes, que suelen ser fondos y marcos: justo encima de la última imagen.
    let at = tpl.zones.length;
    if (type === 'image') at = tpl.zones.map((z) => z.type).lastIndexOf('image') + 1;
    zonesUpdate((zones) => zones.splice(at, 0, zone));
    selectedRaw = at;
  }

  function duplicateZone(i: number) {
    const src = tpl!.zones[i];
    const copy: Zone = {
      ...structuredClone(src),
      id: uniqueId(src.id, tpl!.zones.map((z) => z.id)),
      rect: { ...src.rect, x: src.rect.x + 2, y: src.rect.y + 2 },
    };
    zonesUpdate((zones) => zones.splice(i + 1, 0, copy));
    selectedRaw = i + 1;
  }

  function deleteZone(i: number) {
    zonesUpdate((zones) => zones.splice(i, 1));
    selectedRaw = null;
  }

  /** Cambia el orden de dibujo: +1 = hacia delante. */
  function moveZone(i: number, dir: 1 | -1) {
    const j = i + dir;
    if (j < 0 || j >= tpl!.zones.length) return;
    zonesUpdate((zones) => ([zones[i], zones[j]] = [zones[j], zones[i]]));
    if (selectedRaw === i) selectedRaw = j;
  }

  function toggle(i: number, flag: 'hidden' | 'locked') {
    zonesUpdate((zones) => (zones[i][flag] = !zones[i][flag] || undefined));
  }

  function nudge(dx: number, dy: number) {
    const i = selected;
    if (i === null) return;
    zonesUpdate((zones) => {
      const r = zones[i].rect;
      r.x = Math.round((r.x + dx) * 100) / 100;
      r.y = Math.round((r.y + dy) * 100) / 100;
    }, `nudge/${tipo}/${i}`);
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const i = selected;
    const step = e.shiftKey ? 5 : grid || 0.5;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (tool) tool = null;
      else selectedRaw = null;
    }
    else if (i === null) return;
    else if (e.key === 'Delete' || e.key === 'Backspace') deleteZone(i);
    else if (mod && e.key.toLowerCase() === 'd') duplicateZone(i);
    else if (e.key === 'ArrowLeft') nudge(-step, 0);
    else if (e.key === 'ArrowRight') nudge(step, 0);
    else if (e.key === 'ArrowUp') nudge(0, -step);
    else if (e.key === 'ArrowDown') nudge(0, step);
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="editor">
  <aside class="left">
    <section>
      <div class="head">
        <h4>Tipos de carta</h4>
        <button class="small" onclick={addTipo} title="Nuevo tipo">＋</button>
      </div>
      <ul class="list">
        {#each tipos as t}
          <li>
            <button class="item" class:active={t === tipo} onclick={() => selectTipo(t)}>
              <span>{t}</span>
              <small>{counts[t] ?? 0}</small>
            </button>
          </li>
        {/each}
      </ul>
      {#if tpl}
        <div class="row">
          <button class="small" onclick={renameTipo}>Renombrar</button>
          <button class="small" onclick={duplicateTipo}>Duplicar</button>
          <button class="small danger" onclick={deleteTipo}>Borrar</button>
        </div>
      {/if}
    </section>

    {#if tpl}
      <section class="layers">
        <h4>Zonas <small>(arriba = delante)</small></h4>
        <div class="add">
          {#each ZONE_TYPES as t}
            <button class="small" class:active={tool === t} style:--c={ZONE_COLORS[t]} onclick={() => (tool = tool === t ? null : t)}>
              ＋ {ZONE_LABELS[t]}
            </button>
          {/each}
        </div>
        {#if tool}
          <p class="hint">Traza el rectángulo sobre la carta. Un clic la crea con su tamaño por defecto. Esc cancela.</p>
        {/if}
        <ul class="list">
          {#each tpl.zones.map((z, i) => ({ z, i })).reverse() as { z, i } (i)}
            <li class="layer" class:active={selected === i} class:dim={z.hidden}>
              <button class="item" onclick={() => (selectedRaw = i)}>
                <span class="dot" style:background={ZONE_COLORS[z.type]}></span>
                <span class="name">{z.id}</span>
              </button>
              <span class="tools">
                <button class="icon" title={z.hidden ? 'Mostrar' : 'Ocultar'} onclick={() => toggle(i, 'hidden')}>{z.hidden ? '◌' : '●'}</button>
                <button class="icon" title={z.locked ? 'Desbloquear' : 'Bloquear (no se selecciona en la carta)'} onclick={() => toggle(i, 'locked')}>{z.locked ? '🔒' : '🔓'}</button>
                <button class="icon" title="Hacia delante" onclick={() => moveZone(i, 1)}>↑</button>
                <button class="icon" title="Hacia atrás" onclick={() => moveZone(i, -1)}>↓</button>
              </span>
            </li>
          {:else}
            <li class="muted">Sin zonas. Elige un tipo arriba y trázala sobre la carta.</li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>

  <section class="center">
    {#if tpl}
      <div class="bar">
        <label>
          Vista previa
          <select value={previewRow.id === 'EJEMPLO' ? PLACEHOLDER : previewRow.id} onchange={(e) => (previewId = e.currentTarget.value)}>
            {#each rowsOfTipo as r}<option value={r.id}>{r.id} · {r.titulo || r[`titulo-${ws.lang}`] || ''}</option>{/each}
            <option value={PLACEHOLDER}>Datos de ejemplo</option>
          </select>
        </label>
        <label>
          Rejilla
          <select bind:value={grid}>
            <option value={0}>no</option>
            <option value={0.1}>0,1 mm</option>
            <option value={0.5}>0,5 mm</option>
            <option value={1}>1 mm</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" bind:checked={showGuides} /> Guías</label>
        <span class="spacer"></span>
        <span class="zoom">
          <button class="small" onclick={() => (zoom = Math.max(2, pxPerMm / 1.25))}>−</button>
          <button class="small" class:active={zoom === null} onclick={() => (zoom = null)}>Ajustar</button>
          <button class="small" onclick={() => (zoom = Math.min(40, pxPerMm * 1.25))}>＋</button>
        </span>
      </div>

      <div class="viewport" bind:clientWidth={viewW} bind:clientHeight={viewH}>
        <div class="canvas-wrap">
          <Stage {ws} {tipo} row={previewRow} {pxPerMm} {grid} {showGuides} {unsafe}
            drawType={tool}
            oncreate={(rect, at) => {
              if (tool) addZone(tool, rect, at);
              tool = null;
            }}
            bind:selected={selectedRaw} onwarnings={(w) => (renderWarnings = w)} />
        </div>
      </div>

      <footer class="status">
        {#if selected !== null}
          {@const r = tpl.zones[selected].rect}
          <span>x {r.x} · y {r.y} · {r.w} × {r.h} mm</span>
        {:else}
          <span>{size.width} × {size.height} mm</span>
          <span class="legend">
            <i style:background={GUIDE_COLORS.bleed}></i>sangrado {BLEED_MM} mm
            <i style:background={GUIDE_COLORS.danger}></i>zona peligrosa {size.safe ?? 0} mm
            <i class="line" style:border-color={GUIDE_COLORS.safe}></i>margen de seguridad
          </span>
        {/if}
        <span class="muted">Botón ＋ y arrastra sobre la carta: nueva zona · Arrastra para mover · Alt: sin imanes · Flechas: mover (Mayús ×10) · Supr: borrar · ⌘D: duplicar</span>
        {#if warnings.length}
          <span class="warn" title={warnings.join('\n')}>⚠ {warnings.length} aviso{warnings.length > 1 ? 's' : ''}: {warnings[0]}</span>
        {/if}
      </footer>
    {:else}
      <div class="empty">
        <p>No hay ninguna plantilla.</p>
        <button class="primary" onclick={addTipo}>Crear el primer tipo de carta</button>
      </div>
    {/if}
  </section>

  <aside class="right">
    {#if tpl && selected !== null}
      <ZoneProps {ws} {tipo} index={selected} {columns} />
      <div class="row zone-actions">
        <button class="small" onclick={() => duplicateZone(selected!)}>Duplicar</button>
        <button class="small danger" onclick={() => deleteZone(selected!)}>Borrar zona</button>
      </div>
    {:else if tpl}
      <h4>Plantilla «{tipo}»</h4>
      <p class="muted">
        Selecciona una zona en la carta o en la lista para editarla.<br /><br />
        Las zonas se dibujan de abajo arriba según la lista: pon el fondo al final y los textos al principio.
      </p>
      <label class="stack">
        Trasera por defecto
        <select
          value={tpl.back ?? ''}
          onchange={(e) => {
            const v = e.currentTarget.value;
            ws.update((p) => void (p.templates[tipo].back = v || undefined));
          }}
        >
          <option value="">(ninguna)</option>
          {#each backCandidates as r}<option value={r.id.trim()}>{r.id.trim()} · {r.tipo}</option>{/each}
          {#if tpl.back && !backCandidates.some((r) => r.id.trim() === tpl.back)}
            <option value={tpl.back}>{tpl.back} (no existe)</option>
          {/if}
        </select>
      </label>
      <p class="muted">La columna «trasera» del CSV la sustituye en cada carta; «-» = sin trasera.</p>
      <label class="check">
        <input
          type="checkbox"
          checked={!!tpl.size}
          onchange={(e) =>
            ws.update((p) => {
              p.templates[tipo].size = e.currentTarget.checked ? { width: project.card.width, height: project.card.height } : undefined;
            })}
        />
        Tamaño propio para este tipo
      </label>
      {#if tpl.size}
        <div class="row">
          <label class="f">Ancho <input type="number" step="0.5" value={tpl.size.width} onchange={(e) => { const v = e.currentTarget.valueAsNumber; ws.update((p) => void (p.templates[tipo].size!.width = v)); }} /></label>
          <label class="f">Alto <input type="number" step="0.5" value={tpl.size.height} onchange={(e) => { const v = e.currentTarget.valueAsNumber; ws.update((p) => void (p.templates[tipo].size!.height = v)); }} /></label>
        </div>
      {/if}
    {/if}
  </aside>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: 250px 1fr 290px;
    height: 100%;
    min-height: 0;
  }
  aside {
    padding: 12px 14px;
    overflow: auto;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .left {
    border-right: 1px solid var(--border);
  }
  .right {
    border-left: 1px solid var(--border);
    gap: 8px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h4 {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  h4 small {
    text-transform: none;
    letter-spacing: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    border-radius: 5px;
  }
  .item:hover {
    background: #2b2f38;
  }
  .item.active,
  .layer.active {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .item span:first-child {
    flex: 1;
  }
  .item small {
    color: var(--muted);
  }
  .layer {
    display: flex;
    align-items: center;
    border-radius: 5px;
  }
  .layer .item {
    flex: 1;
    min-width: 0;
  }
  .layer.active .item {
    background: none;
  }
  .layer.dim .name {
    opacity: 0.45;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none !important;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .tools {
    display: flex;
    opacity: 0.35;
  }
  .layer:hover .tools,
  .layer.active .tools {
    opacity: 1;
  }
  .icon {
    all: unset;
    cursor: pointer;
    width: 20px;
    text-align: center;
    font-size: 11px;
  }
  .icon:hover {
    color: var(--accent);
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .add button {
    border-left: 3px solid var(--c);
  }
  .row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  button.small {
    padding: 2px 8px;
    font-size: 12px;
  }
  button.small.active {
    background: var(--accent);
    color: #fff;
  }
  button.danger:hover {
    border-color: #c44;
    color: #f88;
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
    flex-wrap: wrap;
  }
  .bar label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bar select {
    padding: 2px 6px;
    max-width: 220px;
  }
  .spacer {
    flex: 1;
  }
  .zoom {
    display: flex;
    gap: 4px;
  }
  .viewport {
    flex: 1;
    overflow: auto;
    min-height: 0;
    background: #121418 radial-gradient(circle, #22262e 1px, transparent 1px) 0 0 / 16px 16px;
  }
  .canvas-wrap {
    min-width: 100%;
    min-height: 100%;
    width: max-content;
    display: grid;
    place-items: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .status {
    display: flex;
    gap: 16px;
    padding: 6px 14px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
  }
  .muted {
    color: var(--muted);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
  }
  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-left: 6px;
  }
  .legend i.line {
    height: 0;
    border-top: 2px dashed;
    border-radius: 0;
  }
  .warn {
    color: var(--warn);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
  }
  .f {
    display: flex;
    gap: 4px;
    align-items: center;
    color: var(--muted);
  }
  .f input {
    width: 70px;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--accent);
  }
  .zone-actions {
    margin-top: 12px;
  }
  .empty {
    margin: auto;
    text-align: center;
  }
</style>
