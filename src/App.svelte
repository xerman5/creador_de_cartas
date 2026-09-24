<script lang="ts">
  import { DirectorySource, FileListSource, UrlSource } from './core/assets';
  import { DEFAULT_CSV, defaultProject, PROJECT_FILE, serializeProject } from './core/project';
  import CardsView from './lib/CardsView.svelte';
  import ProjectSettings from './lib/ProjectSettings.svelte';
  import TemplateEditor from './lib/TemplateEditor.svelte';
  import { Workspace } from './lib/workspace.svelte';

  type Tab = 'proyecto' | 'plantillas' | 'cartas';
  const TABS: [Tab, string][] = [
    ['proyecto', '1 · Proyecto'],
    ['plantillas', '2 · Plantillas'],
    ['cartas', '3 · Cartas'],
  ];

  const ws = new Workspace();
  let tab = $state<Tab>('cartas');
  let autoReload = $state(false);
  let editorKey = $state(0);
  let editTipo = $state('');
  let fileInput: HTMLInputElement;

  const canReload = $derived(ws.source instanceof DirectorySource || ws.source instanceof UrlSource);

  function confirmDiscard() {
    return !ws.dirty || confirm('Hay cambios sin guardar en el proyecto. ¿Descartarlos?');
  }

  async function openFolder() {
    if (!confirmDiscard()) return;
    if (!window.showDirectoryPicker) {
      fileInput.click();
      return;
    }
    try {
      await ws.open(new DirectorySource(await window.showDirectoryPicker({ mode: 'read' })));
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') ws.error = String(e);
    }
  }

  function onFiles() {
    if (fileInput.files?.length) ws.open(new FileListSource(fileInput.files));
    fileInput.value = '';
  }

  function openExample() {
    if (confirmDiscard()) ws.open(new UrlSource('ejemplo/', 'ejemplo'));
  }

  /** Crea proyecto.json y cartas.csv en una carpeta (vacía o no) y la abre. */
  async function newProject() {
    if (!window.showDirectoryPicker) {
      ws.error = 'Crear un proyecto nuevo necesita Chrome o Edge (acceso a carpetas). Puedes copiar la carpeta del ejemplo y abrirla.';
      return;
    }
    if (!confirmDiscard()) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const src = new DirectorySource(handle);
      if (await src.read(PROJECT_FILE)) {
        if (!confirm(`«${handle.name}» ya tiene un proyecto. ¿Abrirlo?`)) return;
      } else {
        await src.write(PROJECT_FILE, serializeProject(defaultProject(handle.name)));
        if (!(await src.read('cartas.csv'))) await src.write('cartas.csv', DEFAULT_CSV);
      }
      if (await ws.open(src)) tab = 'proyecto';
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') ws.error = String(e);
    }
  }

  function editTemplate(tipo: string) {
    editTipo = tipo;
    editorKey++;
    tab = 'plantillas';
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || !ws.lp) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      ws.save();
      return;
    }
    // Dentro de un campo de texto, deshacer es el del propio campo.
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    if (key === 'z' && !e.shiftKey) ws.undo();
    else if ((key === 'z' && e.shiftKey) || key === 'y') ws.redo();
    else return;
    e.preventDefault();
  }

  function onbeforeunload(e: BeforeUnloadEvent) {
    if (ws.dirty) e.preventDefault();
  }

  // index.html#ejemplo abre el ejemplo directamente (#ejemplo/plantillas abre esa pestaña).
  if (location.hash.startsWith('#ejemplo')) {
    const t = location.hash.split('/')[1] as Tab | undefined;
    ws.open(new UrlSource('ejemplo/', 'ejemplo')).then(() => t && (tab = t));
  }

  // Recarga automática: vigila proyecto.json y el CSV (solo con carpetas abiertas en Chrome/Edge).
  // Con cambios sin guardar, solo se relee el CSV.
  $effect(() => {
    const src = ws.source;
    if (!autoReload || !src?.stamp || !ws.lp) return;
    const paths = [PROJECT_FILE, ws.lp.project.csv];
    let last = '';
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const s = await src.stamp!(paths);
        if (last && s !== last) await ws.open(src);
        last = s;
      } finally {
        busy = false;
      }
    }, 1500);
    return () => clearInterval(id);
  });
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<input type="file" hidden multiple bind:this={fileInput} onchange={onFiles} {...{ webkitdirectory: true }} />

<div class="app">
  <header class="toolbar">
    <strong class="brand">Creador de cartas</strong>

    {#if ws.lp}
      <nav class="tabs">
        {#each TABS as [id, label]}
          <button class:active={tab === id} onclick={() => (tab = id)}>{label}</button>
        {/each}
      </nav>
    {/if}

    <span class="spacer"></span>

    {#if ws.lp}
      <button class="ghost" onclick={() => ws.undo()} disabled={!ws.canUndo} title="Deshacer (⌘Z)">↶</button>
      <button class="ghost" onclick={() => ws.redo()} disabled={!ws.canRedo} title="Rehacer (⇧⌘Z)">↷</button>
      <button
        class:primary={ws.dirty}
        onclick={() => ws.save()}
        disabled={!ws.dirty}
        title={ws.source?.write ? 'Guardar proyecto.json en la carpeta (⌘S)' : 'Descargar proyecto.json (⌘S)'}
      >
        {ws.dirty ? '● Guardar' : 'Guardado'}
      </button>
      {#if ws.lp.langs.length}
        <select bind:value={ws.lang} title="Idioma">
          {#each ws.lp.langs as l}<option value={l}>{l.toUpperCase()}</option>{/each}
        </select>
      {/if}
      <span class="sep"></span>
    {/if}

    <button class="ghost" onclick={newProject} disabled={ws.loading}>Nuevo…</button>
    <button class="ghost" onclick={openFolder} disabled={ws.loading}>Abrir…</button>
    <button class="ghost" onclick={openExample} disabled={ws.loading}>Ejemplo</button>
    {#if ws.source}
      <button class="ghost" onclick={() => ws.source && ws.open(ws.source)} disabled={ws.loading || !canReload} title="Volver a leer CSV e imágenes">⟳</button>
      {#if ws.source.stamp}
        <label class="check" title="Recargar al guardar el CSV desde otro programa"><input type="checkbox" bind:checked={autoReload} /> auto</label>
      {/if}
    {/if}
  </header>

  {#if ws.error}
    <div class="error">{ws.error} <button class="ghost" onclick={() => (ws.error = '')}>✕</button></div>
  {/if}

  <div class="body">
    {#if !ws.lp}
      <div class="welcome">
        <h1>Creador de cartas</h1>
        <p>
          Un proyecto es una carpeta con <code>proyecto.json</code> (tamaño, atributos y plantillas), un CSV con las cartas
          y una carpeta <code>assets/</code> con las imágenes.
        </p>
        <div class="row">
          <button class="primary" onclick={newProject}>Nuevo proyecto…</button>
          <button onclick={openFolder}>Abrir carpeta…</button>
          <button onclick={openExample}>Ver el ejemplo</button>
        </div>
      </div>
    {:else if tab === 'proyecto'}
      <ProjectSettings {ws} onedit={editTemplate} />
    {:else if tab === 'plantillas'}
      {#key editorKey}
        <TemplateEditor {ws} initialTipo={editTipo} />
      {/key}
    {:else}
      <CardsView {ws} />
    {/if}
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px 14px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    margin-right: 12px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    background: #16181d;
    padding: 3px;
    border-radius: 8px;
  }
  .tabs button {
    border: 0;
    background: transparent;
    padding: 4px 14px;
    color: var(--muted);
  }
  .tabs button.active {
    background: #2f3440;
    color: var(--text);
  }
  .spacer {
    flex: 1;
  }
  .sep {
    width: 1px;
    height: 22px;
    background: var(--border);
    margin: 0 6px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .error {
    background: #5c1d1d;
    color: #ffd7d7;
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .welcome {
    max-width: 600px;
    margin: 12vh auto;
    padding: 0 16px;
    text-align: center;
  }
  .welcome .row {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
