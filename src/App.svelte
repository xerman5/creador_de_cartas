<script lang="ts">
  import { DirectorySource, FileListSource, UrlSource, type FileSource } from './core/assets';
  import { DEFAULT_CSV, defaultProject, PROJECT_FILE, serializeProject } from './core/project';
  import CardsView from './lib/CardsView.svelte';
  import ProjectSettings from './lib/ProjectSettings.svelte';
  import ResourcesView from './lib/ResourcesView.svelte';
  import TemplateEditor from './lib/TemplateEditor.svelte';
  import Wizard from './lib/wizard/Wizard.svelte';
  import { loadResume, type ResumeContext } from './lib/wizard/resume';
  import { Workspace } from './lib/workspace.svelte';

  type Tab = 'proyecto' | 'recursos' | 'plantillas' | 'cartas';
  const TABS: [Tab, string][] = [
    ['proyecto', '1 · Proyecto'],
    ['recursos', '2 · Recursos'],
    ['plantillas', '3 · Plantillas'],
    ['cartas', '4 · Cartas'],
  ];

  const ws = new Workspace();
  let tab = $state<Tab>('cartas');
  let autoReload = $state(false);
  let editorKey = $state(0);
  let editTipo = $state('');
  let fileInput: HTMLInputElement;
  let wizard = $state(false);
  /** Con él, el asistente trabaja sobre el proyecto abierto en vez de crear uno nuevo. */
  let resume = $state.raw<ResumeContext | null>(null);
  let notice = $state('');

  function openWizard() {
    if (!confirmDiscard()) return;
    resume = null;
    wizard = true;
  }

  async function resumeWizard() {
    const lp = ws.lp;
    if (!lp || !ws.source) return;
    if (ws.dirty && !confirm('Hay cambios sin guardar. El asistente trabaja sobre lo guardado: ¿guardarlos antes de seguir?')) return;
    if (ws.dirty) await ws.save();
    try {
      resume = await loadResume(ws.source, lp.project);
      if (resume) wizard = true;
      else ws.error = 'Este proyecto no se hizo con el asistente (no tiene asistente.json).';
    } catch (e) {
      ws.error = e instanceof Error ? e.message : String(e);
    }
  }

  async function fromWizard(src: FileSource, note = '') {
    if (await ws.open(src, true)) {
      wizard = false;
      resume = null;
      tab = 'cartas';
      notice = note;
    }
  }

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
    if (confirmDiscard()) ws.open(new UrlSource('ejemplo/', 'ejemplo')).then((ok) => ok && (wizard = false));
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

    {#if ws.lp && !wizard}
      <nav class="tabs">
        {#each TABS as [id, label]}
          <button class:active={tab === id} onclick={() => (tab = id)}>{label}</button>
        {/each}
      </nav>
    {/if}

    <span class="spacer"></span>

    {#if ws.lp && !wizard}
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

    {#if ws.lp && ws.hasWizard && !wizard}
      <button class="ghost" onclick={resumeWizard} disabled={ws.loading} title="Volver al asistente con este proyecto para cambiar lo que quieras">Asistente</button>
    {/if}
    <button class="ghost" onclick={openWizard} disabled={ws.loading || wizard} title="Crear un proyecto con el asistente">Nuevo…</button>
    <button class="ghost" onclick={openFolder} disabled={ws.loading}>Abrir…</button>
    <button class="ghost" onclick={openExample} disabled={ws.loading}>Ejemplo</button>
    {#if ws.source}
      <button class="ghost" onclick={() => ws.source && ws.open(ws.source)} disabled={ws.loading || !canReload} title="Volver a leer CSV e imágenes">⟳</button>
      {#if ws.source.stamp}
        <label class="check" title="Recargar al guardar el CSV desde otro programa"><input type="checkbox" bind:checked={autoReload} /> auto</label>
      {/if}
    {/if}
  </header>

  {#if notice && !wizard}
    <div class="notice">{notice} <button class="ghost" onclick={() => (notice = '')}>✕</button></div>
  {/if}
  {#if ws.error}
    <div class="error">{ws.error} <button class="ghost" onclick={() => (ws.error = '')}>✕</button></div>
  {/if}

  <div class="body">
    {#if wizard}
      {#key resume}
        <Wizard {resume} oncreate={fromWizard} oncancel={() => ((wizard = false), (resume = null))} />
      {/key}
    {:else if !ws.lp}
      <div class="welcome">
        <h1>Creador de cartas</h1>
        <p>
          Un proyecto es una carpeta con <code>proyecto.json</code> (tamaño, atributos y plantillas), un CSV con las cartas
          y una carpeta <code>assets/</code> con las imágenes.
        </p>
        <div class="row">
          <button class="primary" onclick={openWizard}>Crear con el asistente</button>
          <button onclick={openFolder}>Abrir carpeta…</button>
          <button onclick={openExample}>Ver el ejemplo</button>
        </div>
        <p class="alt">
          El asistente te pregunta cómo es tu juego y deja el proyecto listo para rellenar.
          {#if window.showDirectoryPicker}¿Prefieres empezar sin nada? <button class="link" onclick={newProject}>Proyecto vacío…</button>{/if}
        </p>
      </div>
    {:else if tab === 'proyecto'}
      <ProjectSettings {ws} onedit={editTemplate} />
    {:else if tab === 'recursos'}
      <ResourcesView {ws} />
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
  .welcome .alt {
    color: var(--muted);
    font-size: 13px;
    margin-top: 18px;
  }
  .link {
    all: unset;
    cursor: pointer;
    color: var(--accent);
    text-decoration: underline;
  }
  .notice {
    background: #1d3355;
    color: #d7e6ff;
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>
