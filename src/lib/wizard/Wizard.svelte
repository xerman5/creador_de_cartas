<script lang="ts">
  import { DirectorySource, MemorySource, type FileSource } from '../../core/assets';
  import { saveZip, slug } from '../../core/export';
  import { PROJECT_FILE, type LoadedProject } from '../../core/project';
  import type { RenderOptions } from '../../core/render';
  import { normalizeKey } from '../../core/text';
  import {
    attrKey,
    defaultAnswers,
    DESIGNS,
    ELEMENTS,
    FONT_PAIRS,
    PALETTES,
    resolvedType,
    type DesignId,
    type ElementKey,
    type TypeAnswer,
    type WizardAnswers,
  } from '../../core/wizard/answers';
  import { buildProject, MAX_ROWS_PER_TYPE, projectFiles } from '../../core/wizard/build';
  import { CARD_PRESETS } from '../../core/zones';
  import CardView from '../CardView.svelte';
  import { backRow, clearDraft, loadDraft, previewProject, rowOfType, saveDraft } from './preview';

  let { oncreate, oncancel }: { oncreate: (src: FileSource, note?: string) => void; oncancel: () => void } = $props();

  const STEPS = [
    { id: 'proyecto', title: 'Tu juego' },
    { id: 'tipos', title: 'Tipos de carta' },
    { id: 'contenido', title: 'Qué lleva cada carta' },
    { id: 'atributos', title: 'Atributos y rareza' },
    { id: 'diseno', title: 'Diseño' },
    { id: 'ajustes', title: 'Ajustes' },
    { id: 'traseras', title: 'Traseras' },
    { id: 'crear', title: 'Crear' },
  ] as const;
  const LANGS: [string, string][] = [
    ['es', 'Español'],
    ['en', 'Inglés'],
    ['fr', 'Francés'],
    ['de', 'Alemán'],
    ['it', 'Italiano'],
    ['pt', 'Portugués'],
  ];

  const draft = loadDraft();
  let answers = $state<WizardAnswers>(draft?.answers ?? defaultAnswers());
  let step = $state(Math.min(draft?.step ?? 0, STEPS.length - 1));
  let reached = $state(draft?.step ?? 0);
  let current = $state(0);
  let busy = $state('');
  let error = $state('');

  const currentType = $derived(answers.types[Math.min(current, answers.types.length - 1)]);
  const labels = $derived(answers.types.map((t) => t.label.trim()));
  const resolved = $derived(answers.types.map((t) => resolvedType(answers, t)));
  const uses = (e: ElementKey) => answers.types.some((t) => resolvedType(answers, t).elements.has(e));

  // ------------------------------------------------------------ vista previa

  let preview = $state.raw<LoadedProject | null>(null);
  let designPreviews = $state.raw<Partial<Record<DesignId, LoadedProject>>>({});
  const opts: RenderOptions = { dpi: 110, lang: '', bleed: false };
  const small: RenderOptions = { dpi: 70, lang: '', bleed: false };

  function swap<T extends { assets: { dispose(): void } } | null>(old: T) {
    setTimeout(() => old?.assets.dispose(), 4000);
  }

  $effect(() => {
    const snap = $state.snapshot(answers) as WizardAnswers;
    saveDraft(snap, step);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const lp = await previewProject(snap);
        if (cancelled) return lp.assets.dispose();
        swap(preview);
        preview = lp;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  });

  // Las cuatro variantes solo se dibujan en el paso de diseño.
  $effect(() => {
    if (STEPS[step].id !== 'diseno') return;
    const snap = $state.snapshot(answers) as WizardAnswers;
    let cancelled = false;
    (async () => {
      const next: Partial<Record<DesignId, LoadedProject>> = {};
      for (const d of DESIGNS) next[d.id] = await previewProject(snap, d.id);
      if (cancelled) return Object.values(next).forEach((lp) => lp?.assets.dispose());
      Object.values(designPreviews).forEach((lp) => swap(lp ?? null));
      designPreviews = next;
    })();
    return () => (cancelled = true);
  });

  // ------------------------------------------------------------ validación

  const problems = $derived.by((): string[] => {
    const id = STEPS[step].id;
    const out: string[] = [];
    if (id === 'proyecto') {
      if (!answers.name.trim()) out.push('Ponle un nombre al juego.');
      if (!answers.langs.length) out.push('Elige al menos un idioma.');
      if (!(answers.size.width >= 20 && answers.size.height >= 20)) out.push('El tamaño de carta debe ser de al menos 20 × 20 mm.');
    }
    if (id === 'tipos') {
      if (!answers.types.length) out.push('Añade al menos un tipo de carta.');
      const keys = labels.map(normalizeKey);
      if (keys.some((k) => !k)) out.push('Cada tipo necesita un nombre.');
      else if (new Set(keys).size !== keys.length) out.push('Hay dos tipos con el mismo nombre.');
      if (keys.includes('trasera')) out.push('«Trasera» está reservado para los dorsos: usa otro nombre.');
      if (answers.types.some((t) => !(t.count >= 1 && t.count <= MAX_ROWS_PER_TYPE)))
        out.push(`La cantidad de cada tipo debe estar entre 1 y ${MAX_ROWS_PER_TYPE}.`);
    }
    if (id === 'atributos') {
      const keys = answers.attributes.map(attrKey);
      if (keys.some((k) => !k)) out.push('Cada atributo necesita un nombre.');
      else if (new Set(keys).size !== keys.length) out.push('Hay dos atributos con el mismo nombre.');
      if (keys.includes('coste')) out.push('«Coste» ya existe como elemento propio: usa otro nombre.');
      answers.types.forEach((t, i) => {
        if (!t.sameAs && t.elements.includes('stats') && !resolved[i].attributes.length)
          out.push(`«${t.label}» lleva atributos pero no has elegido cuáles.`);
      });
      if (uses('variant') && !answers.variant.values.some((v) => v.name.trim())) out.push('Define al menos un valor de rareza o facción.');
    }
    return out;
  });

  function go(to: number) {
    if (to > step && problems.length) return;
    step = Math.max(0, Math.min(STEPS.length - 1, to));
    reached = Math.max(reached, step);
    error = '';
  }

  // ------------------------------------------------------------ edición

  function addType() {
    let n = answers.types.length + 1;
    while (labels.map(normalizeKey).includes(`tipo ${n}`)) n++;
    answers.types.push({ label: `Tipo ${n}`, count: 10, elements: ['art', 'rules', 'number'], attributes: [] });
  }

  function removeType(i: number) {
    const gone = normalizeKey(answers.types[i].label);
    answers.types.splice(i, 1);
    for (const t of answers.types) if (t.sameAs && normalizeKey(t.sameAs) === gone) t.sameAs = undefined;
    current = Math.min(current, answers.types.length - 1);
  }

  function toggleElement(t: TypeAnswer, e: ElementKey) {
    if (t.elements.includes(e)) t.elements = t.elements.filter((x) => x !== e);
    else {
      t.elements = [...t.elements, e];
      if (e === 'stats' && !t.attributes.length) t.attributes = answers.attributes.map(attrKey).filter(Boolean);
    }
  }

  function toggleAttr(t: TypeAnswer, key: string) {
    t.attributes = t.attributes.includes(key) ? t.attributes.filter((k) => k !== key) : [...t.attributes, key];
  }

  function renameAttr(i: number, label: string) {
    const old = attrKey(answers.attributes[i]);
    answers.attributes[i].label = label;
    const key = attrKey(answers.attributes[i]);
    for (const t of answers.types) t.attributes = t.attributes.map((k) => (k === old ? key : k));
  }

  function removeAttr(i: number) {
    const key = attrKey(answers.attributes[i]);
    answers.attributes.splice(i, 1);
    for (const t of answers.types) t.attributes = t.attributes.filter((k) => k !== key);
  }

  const VARIANT_NAMES = ['Rareza', 'Facción', 'Elemento'];
  const ATTR_COLORS = ['#d9534f', '#4caf50', '#3d8fe0', '#f0b429', '#a45bd6', '#26a69a', '#ef7d3c', '#8d6e63'];

  function toggleLang(code: string) {
    answers.langs = answers.langs.includes(code) ? answers.langs.filter((l) => l !== code) : [...answers.langs, code];
  }

  function restart() {
    if (!confirm('¿Empezar de cero? Se pierden las respuestas de este asistente.')) return;
    clearDraft();
    answers = defaultAnswers();
    step = 0;
    reached = 0;
    current = 0;
  }

  // ------------------------------------------------------------ crear

  const summary = $derived.by(() => {
    const cards = answers.types.reduce((s, t) => s + (t.count || 0), 0);
    return { cards, types: answers.types.length };
  });

  function files(): Record<string, string> {
    return projectFiles(buildProject($state.snapshot(answers) as WizardAnswers));
  }

  async function run(label: string, fn: () => Promise<void>) {
    busy = label;
    error = '';
    try {
      await fn();
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = '';
    }
  }

  const createInFolder = () =>
    run('Guardando…', async () => {
      const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      const src = new DirectorySource(handle);
      if ((await src.read(PROJECT_FILE)) && !confirm(`«${handle.name}» ya tiene un proyecto. ¿Sustituirlo por el nuevo?`)) return;
      for (const [path, data] of Object.entries(files())) await src.write(path, data);
      clearDraft();
      oncreate(src);
    });

  const createZip = () =>
    run('Preparando el zip…', async () => {
      const all = files();
      const dir = slug(answers.name);
      async function* entries() {
        for (const [path, input] of Object.entries(all)) yield { name: `${dir}/${path}`, input };
      }
      if (!(await saveZip(entries(), `${dir}.zip`))) return;
      clearDraft();
      oncreate(new MemorySource(answers.name, all), 'Descomprime el zip y ábrelo con «Abrir…» para guardar los cambios en esa carpeta.');
    });

  function tryIt() {
    oncreate(new MemorySource(answers.name, files()), 'Proyecto de prueba: no está guardado en ninguna carpeta.');
  }
</script>

{#snippet card(lp: LoadedProject | null | undefined, label: string, o: RenderOptions, back = false)}
  {@const row = back ? backRow(lp ?? null, label) : rowOfType(lp ?? null, label)}
  {#if lp && row}
    <CardView {row} {lp} opts={{ ...o, lang: lp.langs[0] ?? '' }} />
  {:else}
    <div class="placeholder">Dibujando…</div>
  {/if}
{/snippet}

{#snippet typeTabs()}
  {#if answers.types.length > 1}
    <div class="tabs">
      {#each answers.types as t, i}
        <button class:active={i === current} onclick={() => (current = i)}>{t.label || `Tipo ${i + 1}`}</button>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="wizard">
  <nav class="steps">
    <h3>Asistente</h3>
    <ol>
      {#each STEPS as s, i}
        <li>
          <button class:active={i === step} class:done={i < reached && i !== step} disabled={i > reached} onclick={() => go(i)}>
            <span class="n">{i < reached && i !== step ? '✓' : i + 1}</span>
            {s.title}
          </button>
        </li>
      {/each}
    </ol>
    <div class="nav-foot">
      <button class="ghost small" onclick={restart}>Empezar de cero</button>
      <button class="ghost small" onclick={oncancel}>Salir</button>
    </div>
  </nav>

  <main class="questions">
    {#if STEPS[step].id === 'proyecto'}
      <h2>Tu juego</h2>
      <p class="lead">Empecemos por lo básico. Todo se puede cambiar después.</p>
      <label class="field">
        <span>¿Cómo se llama?</span>
        <input id="wz-name" type="text" bind:value={answers.name} placeholder="Nombre del juego" />
      </label>
      <div class="field">
        <span>¿De qué tamaño son las cartas?</span>
        <div class="chips">
          {#each CARD_PRESETS as p}
            <button
              class="chip"
              class:active={answers.size.width === p.width && answers.size.height === p.height}
              onclick={() => (answers.size = { width: p.width, height: p.height })}
            >
              <b>{p.name}</b> <small>{p.width}×{p.height} mm</small>
            </button>
          {/each}
        </div>
        <div class="row">
          <label class="inline">Ancho <input type="number" min="20" step="0.5" bind:value={answers.size.width} /> mm</label>
          <label class="inline">Alto <input type="number" min="20" step="0.5" bind:value={answers.size.height} /> mm</label>
        </div>
        <p class="hint">¿No lo sabes? Póker (63 × 88 mm) es el estándar de la mayoría de juegos. El sangrado de 3 mm se añade solo.</p>
      </div>
      <div class="field">
        <span>¿En qué idiomas estarán los textos?</span>
        <div class="chips">
          {#each LANGS as [code, name]}
            <button class="chip" class:active={answers.langs.includes(code)} onclick={() => toggleLang(code)}>{name}</button>
          {/each}
        </div>
        <p class="hint">Con varios idiomas, el CSV tendrá una columna por idioma (título-es, título-en…) y podrás exportar cada uno.</p>
      </div>
    {:else if STEPS[step].id === 'tipos'}
      <h2>Tipos de carta</h2>
      <p class="lead">
        Un tipo es un formato de carta con su propio diseño: <i>Criatura</i>, <i>Hechizo</i>, <i>Recurso</i>… ¿Cuántos tiene tu juego y
        cuántas cartas de cada uno?
      </p>
      <table class="types">
        <thead><tr><th>Nombre</th><th>Cartas</th><th></th></tr></thead>
        <tbody>
          {#each answers.types as t, i}
            <tr>
              <td><input type="text" bind:value={t.label} placeholder="Nombre del tipo" /></td>
              <td><input type="number" min="1" max={MAX_ROWS_PER_TYPE} bind:value={t.count} /></td>
              <td>
                {#if answers.types.length > 1}<button class="ghost small" onclick={() => removeType(i)} title="Quitar">✕</button>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="small" onclick={addType}>＋ Añadir tipo</button>
      <p class="hint">La cantidad es aproximada: el asistente crea esas filas en la tabla para que solo tengas que rellenarlas.</p>
    {:else if STEPS[step].id === 'contenido'}
      <h2>Qué lleva cada carta</h2>
      <p class="lead">Marca lo que tiene cada tipo. El título está siempre. La carta de la derecha cambia con cada respuesta.</p>
      {@render typeTabs()}
      {#if currentType}
        {@const others = answers.types.filter((o) => o !== currentType && !o.sameAs)}
        {#if others.length}
          <label class="field inline-field">
            <span>¿Es igual que otro tipo?</span>
            <select
              value={currentType.sameAs ?? ''}
              onchange={(e) => (currentType.sameAs = e.currentTarget.value || undefined)}
            >
              <option value="">No, tiene su propio contenido</option>
              {#each others as o}<option value={o.label}>Igual que «{o.label}»</option>{/each}
            </select>
          </label>
        {/if}
        {#if currentType.sameAs}
          <p class="hint">«{currentType.label}» usará los mismos elementos y atributos que «{currentType.sameAs}», con su propia plantilla.</p>
        {:else}
          <div class="elements">
            {#each ELEMENTS as el}
              <button class="element" class:active={currentType.elements.includes(el.key)} onclick={() => toggleElement(currentType, el.key)}>
                <span class="tick">{currentType.elements.includes(el.key) ? '✓' : ''}</span>
                <span><b>{el.label}</b><small>{el.hint}</small></span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    {:else if STEPS[step].id === 'atributos'}
      <h2>Atributos y rareza</h2>
      {#if !uses('stats') && !uses('cost') && !uses('variant')}
        <p class="lead">Tus cartas no usan atributos, coste ni rareza. Puedes seguir.</p>
      {/if}
      {#if uses('stats')}
        <div class="field">
          <span>¿Qué atributos existen en tu juego?</span>
          <p class="hint">Cada uno tendrá un icono provisional de su color. En los textos, <code>{'{ataque}'}</code> dibuja su icono.</p>
          {#each answers.attributes as at, i}
            <div class="row attr">
              <input type="color" bind:value={at.color} />
              <input type="text" value={at.label} oninput={(e) => renameAttr(i, e.currentTarget.value)} placeholder="Nombre" />
              <button class="ghost small" onclick={() => removeAttr(i)} title="Quitar">✕</button>
            </div>
          {/each}
          <button class="small" onclick={() => answers.attributes.push({ label: '', color: ATTR_COLORS[answers.attributes.length % ATTR_COLORS.length] })}>
            ＋ Atributo
          </button>
        </div>
        <div class="field">
          <span>¿Cuáles lleva cada tipo?</span>
          {#each answers.types as t}
            {#if !t.sameAs && t.elements.includes('stats')}
              <div class="assign">
                <b>{t.label}</b>
                <div class="chips">
                  {#each answers.attributes as at}
                    {#if attrKey(at)}
                      <button class="chip" class:active={t.attributes.includes(attrKey(at))} onclick={() => toggleAttr(t, attrKey(at))}>{at.label}</button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
      {#if uses('cost')}
        <p class="hint">El <b>coste</b> es un atributo aparte con icono de moneda; su valor va en la misma columna: <code>coste:3</code>.</p>
      {/if}
      {#if uses('variant')}
        <div class="field">
          <span>¿Cómo se llama la marca de color?</span>
          <div class="chips">
            {#each VARIANT_NAMES as name}
              <button class="chip" class:active={answers.variant.column === name} onclick={() => (answers.variant.column = name)}>{name}</button>
            {/each}
            <input
              class="chip-input"
              class:active={!VARIANT_NAMES.includes(answers.variant.column)}
              type="text"
              value={VARIANT_NAMES.includes(answers.variant.column) ? '' : answers.variant.column}
              oninput={(e) => (answers.variant.column = e.currentTarget.value || 'Rareza')}
              placeholder="Otro nombre"
            />
          </div>
          <span>¿Qué valores tiene y de qué color es cada uno?</span>
          {#each answers.variant.values as v, i}
            <div class="row attr">
              <input type="color" bind:value={v.color} />
              <input type="text" bind:value={v.name} placeholder="Valor" />
              <button class="ghost small" onclick={() => answers.variant.values.splice(i, 1)} title="Quitar">✕</button>
            </div>
          {/each}
          <button class="small" onclick={() => answers.variant.values.push({ name: '', color: '#888888' })}>＋ Valor</button>
        </div>
      {/if}
    {:else if STEPS[step].id === 'diseno'}
      <h2>Elige un diseño</h2>
      <p class="lead">Cada diseño está dibujado con tu contenido. Después podrás ajustarlo.</p>
      {@render typeTabs()}
      <div class="designs">
        {#each DESIGNS as d}
          <button class="design" class:active={answers.design === d.id} onclick={() => (answers.design = d.id)}>
            {@render card(designPreviews[d.id], currentType?.label ?? '', small)}
            <b>{d.label}</b>
            <small>{d.hint}</small>
          </button>
        {/each}
      </div>
    {:else if STEPS[step].id === 'ajustes'}
      <h2>Ajusta el diseño</h2>
      <p class="lead">Unos pocos controles para dejarlo a tu gusto. Para lo demás, está el editor de plantillas.</p>
      {@render typeTabs()}
      <div class="field">
        <span>Colores</span>
        <div class="chips">
          {#each Object.entries(PALETTES) as [id, p]}
            <button class="chip swatch" onclick={() => (answers.adjust.palette = { ...p.colors })}>
              {#each Object.values(p.colors) as c}<i style:background={c}></i>{/each}
              {p.label}
            </button>
          {/each}
        </div>
        <div class="row colors">
          {#each [['principal', 'Principal'], ['acento', 'Acento'], ['papel', 'Papel'], ['tinta', 'Tinta']] as [k, name]}
            <label class="inline"><input type="color" bind:value={answers.adjust.palette[k as keyof typeof answers.adjust.palette]} /> {name}</label>
          {/each}
        </div>
      </div>
      <div class="field">
        <span>Tipografía</span>
        <div class="chips">
          {#each Object.entries(FONT_PAIRS) as [id, fp]}
            <button class="chip" class:active={answers.adjust.fonts === id} style:font-family={fp.title} onclick={() => (answers.adjust.fonts = id)}>
              {fp.label}
            </button>
          {/each}
        </div>
      </div>
      {#if uses('art') && (uses('rules') || uses('flavor'))}
        <label class="field">
          <span>Tamaño de la ilustración: {Math.round(answers.adjust.art * 100)} %</span>
          <input type="range" min="0.3" max="0.75" step="0.05" bind:value={answers.adjust.art} />
        </label>
      {/if}
      {#if uses('stats')}
        <div class="field">
          <span>Atributos</span>
          <div class="seg">
            {#each [['left', 'A la izquierda'], ['right', 'A la derecha'], ['bottom', 'Abajo, en fila']] as [v, t]}
              <button class:active={answers.adjust.attrSide === v} onclick={() => (answers.adjust.attrSide = v as typeof answers.adjust.attrSide)}>{t}</button>
            {/each}
          </div>
        </div>
      {/if}
      {#if uses('cost')}
        <div class="field">
          <span>Coste</span>
          <div class="seg">
            {#each [['left', 'Esquina izquierda'], ['right', 'Esquina derecha']] as [v, t]}
              <button class:active={answers.adjust.costCorner === v} onclick={() => (answers.adjust.costCorner = v as typeof answers.adjust.costCorner)}>{t}</button>
            {/each}
          </div>
        </div>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={answers.adjust.rounded} /> Esquinas redondeadas en cajas y bandas</label>
    {:else if STEPS[step].id === 'traseras'}
      <h2>Traseras</h2>
      <p class="lead">¿Cómo es el dorso de las cartas?</p>
      <div class="options">
        {#each [['common', 'Una para todas', 'El mismo dorso con el nombre del juego.'], ['per-type', 'Una por tipo', 'Cada tipo con su color y su nombre: útil si se barajan por separado.'], ['none', 'Sin trasera', 'Solo anversos; la trasera se añade después si hace falta.']] as [v, t, h]}
          <button class="option" class:active={answers.backs === v} onclick={() => (answers.backs = v as typeof answers.backs)}>
            <b>{t}</b><small>{h}</small>
          </button>
        {/each}
      </div>
    {:else}
      <h2>Crear el proyecto</h2>
      <ul class="summary">
        <li><b>{answers.name}</b> · {answers.size.width} × {answers.size.height} mm + 3 mm de sangrado</li>
        <li>{summary.types} {summary.types === 1 ? 'tipo' : 'tipos'} y {summary.cards} cartas: {labels.join(', ')}</li>
        <li>Diseño «{DESIGNS.find((d) => d.id === answers.design)?.label}», idiomas: {answers.langs.join(', ')}</li>
        <li>Traseras: {answers.backs === 'common' ? 'una para todas' : answers.backs === 'per-type' ? 'una por tipo' : 'ninguna'}</li>
      </ul>
      <p class="lead">
        Se crea la carpeta del proyecto con la tabla de cartas ya rellena de ejemplos e imágenes provisionales. Después solo tendrás que
        poner tus ilustraciones y escribir los textos: el panel de pendientes te dirá qué falta.
      </p>
      <div class="create">
        {#if window.showDirectoryPicker}
          <button class="primary big" disabled={!!busy} onclick={createInFolder}>Guardar en una carpeta…</button>
        {/if}
        <button class:primary={!window.showDirectoryPicker} class="big" disabled={!!busy} onclick={createZip}>Descargar .zip</button>
        <button class="ghost" disabled={!!busy} onclick={tryIt}>Probar sin guardar</button>
      </div>
      {#if busy}<p class="hint">{busy}</p>{/if}
      {#if !window.showDirectoryPicker}
        <p class="hint">Este navegador no puede escribir en carpetas: descarga el zip, descomprímelo y ábrelo con «Abrir…».</p>
      {/if}
    {/if}

    {#if error}<p class="error">{error}</p>{/if}
    {#if problems.length}
      <ul class="problems">{#each problems as p}<li>{p}</li>{/each}</ul>
    {/if}

    <footer class="nav">
      <button onclick={() => go(step - 1)} disabled={step === 0}>← Atrás</button>
      {#if step < STEPS.length - 1}
        <button class="primary" onclick={() => go(step + 1)} disabled={problems.length > 0}>Siguiente →</button>
      {/if}
    </footer>
  </main>

  <aside class="preview">
    {#if STEPS[step].id === 'traseras'}
      {#if answers.backs !== 'none'}
        {@render card(preview, currentType?.label ?? '', opts, true)}
        <small>Trasera</small>
      {:else}
        <p class="hint">Sin trasera.</p>
      {/if}
    {:else if STEPS[step].id === 'diseno'}
      {@render card(designPreviews[answers.design], currentType?.label ?? '', opts)}
      <small>{DESIGNS.find((d) => d.id === answers.design)?.label} · {currentType?.label}</small>
    {:else}
      {#if STEPS[step].id !== 'proyecto' && STEPS[step].id !== 'tipos'}{@render typeTabs()}{/if}
      {@render card(preview, currentType?.label ?? '', opts)}
      <small>{currentType?.label} · vista previa</small>
    {/if}
  </aside>
</div>

<style>
  .wizard {
    display: grid;
    grid-template-columns: 210px minmax(360px, 1fr) minmax(300px, 420px);
    height: 100%;
    min-height: 0;
  }
  .steps {
    border-right: 1px solid var(--border);
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .steps h3 {
    margin: 0 6px 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .steps ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .steps li button {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 7px 8px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--muted);
  }
  .steps li button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  .steps li button.active {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--text);
  }
  .steps li button.done {
    color: var(--text);
  }
  .n {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 12px;
    background: #2b2f38;
    flex: none;
  }
  .active .n {
    background: var(--accent);
    color: #fff;
  }
  .nav-foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
  .questions {
    padding: 24px 32px 16px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  .lead {
    margin: 0;
    color: var(--muted);
    max-width: 62ch;
    line-height: 1.45;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field > span {
    font-weight: 600;
  }
  .inline-field {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    max-width: 62ch;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
  }
  .inline input[type='number'] {
    width: 80px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    border-radius: 999px;
    padding: 5px 12px;
  }
  .chip small {
    color: var(--muted);
  }
  .chip.active,
  .seg button.active,
  .tabs button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .chip.active small {
    color: #dfe6ff;
  }
  .chip-input {
    border-radius: 999px;
    width: 140px;
  }
  .chip-input.active {
    border-color: var(--accent);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .swatch i {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    display: inline-block;
  }
  .swatch i:last-of-type {
    margin-right: 6px;
  }
  .colors input[type='color'],
  .attr input[type='color'] {
    width: 36px;
    height: 30px;
    padding: 2px;
  }
  .attr input[type='text'] {
    width: 220px;
  }
  .types {
    border-collapse: collapse;
    max-width: 460px;
  }
  .types th {
    text-align: left;
    color: var(--muted);
    font-weight: normal;
    font-size: 12px;
    padding: 4px;
  }
  .types td {
    padding: 4px;
  }
  .types td:first-child input {
    width: 260px;
  }
  .types td:nth-child(2) input {
    width: 90px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .tabs button {
    padding: 3px 10px;
    font-size: 12px;
  }
  .elements {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 8px;
  }
  .element,
  .option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    padding: 10px 12px;
  }
  .element > span:last-child,
  .option {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .option {
    align-items: flex-start;
  }
  .element small,
  .option small,
  .design small {
    color: var(--muted);
    font-size: 12px;
  }
  .element.active,
  .option.active,
  .design.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, #2b2f38);
  }
  .tick {
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 4px;
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    font-size: 12px;
    color: #fff;
  }
  .element.active .tick {
    background: var(--accent);
    border-color: var(--accent);
  }
  .assign {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .designs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }
  .design {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    padding: 12px 10px;
    text-align: center;
  }
  .design :global(canvas),
  .design .placeholder {
    width: 150px !important;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .summary {
    margin: 0;
    padding-left: 18px;
    line-height: 1.7;
  }
  .create {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  button.big {
    padding: 10px 18px;
    font-size: 15px;
  }
  button.small {
    padding: 2px 10px;
    font-size: 12px;
    align-self: flex-start;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .problems {
    margin: 0;
    padding-left: 18px;
    color: var(--warn);
    font-size: 13px;
  }
  .error {
    color: #ff8a8a;
    margin: 0;
  }
  .nav {
    margin-top: auto;
    padding-top: 16px;
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--border);
  }
  .preview {
    border-left: 1px solid var(--border);
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    overflow: auto;
    background: #121418 radial-gradient(circle, #22262e 1px, transparent 1px) 0 0 / 16px 16px;
  }
  .preview small {
    color: var(--muted);
  }
  .preview :global(canvas),
  .preview .placeholder {
    width: min(100%, 300px) !important;
  }
  .placeholder {
    aspect-ratio: 63 / 88;
    display: grid;
    place-items: center;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: 6px;
  }
  @media (max-width: 900px) {
    .wizard {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
      overflow: auto;
    }
    .steps {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    .steps ol {
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
</style>
