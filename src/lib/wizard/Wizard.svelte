<script lang="ts">
  import { DirectorySource, MemorySource, type FileSource } from '../../core/assets';
  import { downloadBlob, saveZip, slug } from '../../core/export';
  import { loadProject, PROJECT_FILE, serializeProject, type LoadedProject } from '../../core/project';
  import { pendingItems, type PendingItem } from '../../core/pending';
  import { renderCard } from '../../core/render';
  import { applyAll, handEdited, newWizardFile, WIZARD_FILE, wizardFileJson } from '../../core/wizard/sync';
  import type { ResumeContext } from './resume';
  import type { RenderOptions } from '../../core/render';
  import { normalizeKey } from '../../core/text';
  import {
    attrKey,
    defaultAnswers,
    fileKey,
    DESIGNS,
    ELEMENTS,
    flagOn,
    FONT_PAIRS,
    fontStack,
    isAbility,
    PALETTES,
    resolvedType,
    textKey,
    typeKey,
    type DesignId,
    type ElementKey,
    type TypeAnswer,
    type WizardAnswers,
  } from '../../core/wizard/answers';
  import { buildProject, cardIds, costSvg, MAX_ROWS_PER_TYPE, PLACEHOLDERS, projectFiles, provisionalIcon } from '../../core/wizard/build';
  import {
    FONT_FILE,
    fontFamilyOf,
    matchByName,
    resourceFiles,
    resourcePath,
    shelfOf,
    type ResourceDir,
    type Resources,
    type ShelfId,
  } from '../../core/wizard/resources';
  import ResourceShelf from '../ResourceShelf.svelte';
  import ResourceSlot from '../ResourceSlot.svelte';
  import { tourElements, type Library } from './tour';
  import TypeTour from './TypeTour.svelte';
  import PieceControls from '../panels/PieceControls.svelte';
  import TextControls from '../panels/TextControls.svelte';
  import { cardPixels } from '../../core/card';
  import { acceptsDrop, droppedEntries } from '../drop';
  import { cardRefKey, IMAGE_FILE, IMAGES_DIR, matchImages, type CardRef, type MatchResult } from '../../core/wizard/images';
  import { fillCsv, importCsv, tableColumns, type ImportReport, type TableColumn } from '../../core/wizard/table';
  import { CARD_PRESETS } from '../../core/zones';
  import CardView from '../CardView.svelte';
  import CropEditor from '../CropEditor.svelte';
  import {
    backRow,
    clearDraft,
    imageFiles,
    loadDraft,
    loadDraftResources,
    parseProgress,
    previewLabel,
    previewProject,
    progressJson,
    rowOfType,
    saveDraft,
    saveDraftResources,
  } from './preview';

  let {
    oncreate,
    oncancel,
    resume = null,
  }: {
    oncreate: (src: FileSource, note?: string) => void;
    oncancel: () => void;
    /** Retomar el asistente sobre un proyecto ya creado (si no, se crea uno nuevo). */
    resume?: ResumeContext | null;
  } = $props();

  const STEPS = [
    { id: 'proyecto', title: 'Tu juego' },
    { id: 'tipos', title: 'Tipos de carta' },
    { id: 'contenido', title: 'Qué lleva cada carta' },
    { id: 'atributos', title: 'Atributos y rareza' },
    { id: 'diseno', title: 'Diseño' },
    { id: 'ajustes', title: 'Ajustes' },
    { id: 'recorrido', title: 'Tipo a tipo' },
    { id: 'traseras', title: 'Traseras' },
    { id: 'cartas', title: 'Cartas' },
    { id: 'imagenes', title: 'Imágenes' },
    { id: 'crear', title: 'Crear' },
  ] as const;
  type StepId = (typeof STEPS)[number]['id'];
  // «fino» era el ajuste fino global, sustituido por el recorrido tipo a tipo.
  const stepIndex = (s: string | number) =>
    typeof s === 'number' ? Math.min(s, STEPS.length - 1) : Math.max(0, STEPS.findIndex((x) => x.id === (s === 'fino' ? 'recorrido' : s)));
  const LANGS: [string, string][] = [
    ['es', 'Español'],
    ['en', 'Inglés'],
    ['fr', 'Francés'],
    ['de', 'Alemán'],
    ['it', 'Italiano'],
    ['pt', 'Portugués'],
  ];

  // Al retomar un proyecto no se usa el borrador del navegador: el proyecto es la fuente de verdad.
  // svelte-ignore state_referenced_locally
  const start = resume;
  const draft = start ? null : loadDraft();
  // Retomando, se vuelve adonde se dejó; si se dejó al crear, al recorrido (lo más probable es retocar).
  const firstStep = start ? (start.jump || start.file.step === 'crear' ? 'recorrido' : start.file.step) : (draft?.step ?? 0);
  let answers = $state<WizardAnswers>(start?.answers ?? draft?.answers ?? defaultAnswers());
  let step = $state(stepIndex(firstStep));
  let reached = $state(start ? STEPS.length - 1 : stepIndex(firstStep));
  /** Respuestas al entrar, para saber si hay cambios sin aplicar. */
  const initial = JSON.stringify(start?.answers ?? null);
  // svelte-ignore state_referenced_locally
  let current = $state(Math.max(0, start?.jump ? answers.types.findIndex((t) => typeKey(t) === normalizeKey(start.jump!.type)) : 0));
  /** Carta seleccionada en la tabla (índice dentro del tipo actual). */
  let row = $state(0);
  const stepId = $derived<StepId>(STEPS[step].id);
  let busy = $state('');
  let error = $state('');

  const currentType = $derived(answers.types[Math.min(current, answers.types.length - 1)]);
  const labels = $derived(answers.types.map((t) => t.label.trim()));
  const resolved = $derived(answers.types.map((t) => resolvedType(answers, t)));
  // Lo marcado decide qué se pregunta: si no, marcar «Atributos» sin elegir ninguno escondería la pregunta.
  const uses = (e: ElementKey) => resolved.some((r) => r.declared.has(e));

  // ------------------------------------------------------------ vista previa

  let preview = $state.raw<LoadedProject | null>(null);
  let designPreviews = $state.raw<Partial<Record<DesignId, LoadedProject>>>({});
  const opts: RenderOptions = { dpi: 110, lang: '', bleed: false };
  const small: RenderOptions = { dpi: 70, lang: '', bleed: false };

  function swap<T extends { assets: { dispose(): void } } | null>(old: T) {
    setTimeout(() => old?.assets.dispose(), 4000);
  }

  // Con la tabla o las imágenes a la vista, la vista previa enseña la carta seleccionada.
  const focus = $derived(stepId === 'cartas' || stepId === 'imagenes' ? { type: current, card: row } : undefined);

  $effect(() => {
    const snap = $state.snapshot(answers) as WizardAnswers;
    const f = focus;
    const images = imageMap;
    const res = resources;
    const sid = stepId;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!start) saveDraft(snap, sid);
      try {
        const lp = await previewProject(snap, { focus: f, images, resources: res });
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
      for (const d of DESIGNS) next[d.id] = await previewProject(snap, { design: d.id, resources });
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
    // En el recorrido, «Siguiente» y «Atrás» pasan por cada elemento de cada tipo antes de salir.
    if (stepId === 'recorrido' && Math.abs(to - step) === 1 && tourMove(to - step)) return;
    const from = step;
    step = Math.max(0, Math.min(STEPS.length - 1, to));
    reached = Math.max(reached, step);
    error = '';
    if (STEPS[step].id === 'recorrido' && from !== step) {
      // Entrando desde delante se empieza por el principio; volviendo desde detrás, por el final.
      if (from < step) {
        current = 0;
        tourEl = 0;
      } else {
        current = answers.types.length - 1;
        tourEl = Number.MAX_SAFE_INTEGER;
      }
    }
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

  function moveAttr(i: number, dir: 1 | -1) {
    const j = i + dir;
    if (j < 0 || j >= answers.attributes.length) return;
    const list = answers.attributes;
    [list[i], list[j]] = [list[j], list[i]];
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
    row = 0;
    imageMap = new Map();
    match = null;
    setResources(new Map());
  }

  // ------------------------------------------------------------ progreso

  let notice = $state(
    start
      ? `Retomas el asistente de «${start.answers.name}». Cambia lo que quieras y, al final, «Aplicar».` +
          (start.notes.length ? ` Se han traído los cambios hechos fuera del asistente: ${start.notes.join(', ')}.` : '')
      : '',
  );
  let progressInput: HTMLInputElement;

  async function saveProgress() {
    const json = await progressJson($state.snapshot(answers) as WizardAnswers, stepId, resources);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${slug(answers.name)}.asistente.json`);
    notice = 'Progreso guardado (con tus iconos y fondos). Para seguir otro día, abre el asistente y pulsa «Cargar progreso…».';
  }

  async function loadProgress(file: File) {
    try {
      const p = parseProgress(await file.text());
      answers = p.answers;
      setResources(p.resources ?? new Map());
      step = stepIndex(p.step);
      reached = Math.max(step, STEPS.length - 1);
      current = 0;
      row = 0;
      const pending = pendingImages();
      notice = `Progreso de «${p.answers.name}» cargado.` + (pending ? ` ${pending} cartas usan imágenes de una carpeta: vuelve a elegirla en el paso «Imágenes».` : '');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // ------------------------------------------------------------ recursos (iconos y fondos)

  /** Iconos y fondos subidos: van al proyecto y al archivo de progreso. */
  let resources = $state.raw<Resources>(start?.resources ?? new Map());
  let resourceUrls = $state.raw<Map<string, string>>(new Map());
  // Al abrir, los del borrador de este navegador (si no se ha cargado ya otra cosa).
  if (!start)
    loadDraftResources().then((r) => {
      if (!resources.size && r.size) resources = r;
    });

  $effect(() => {
    const m = new Map([...resources].map(([p, b]) => [p, URL.createObjectURL(b)]));
    resourceUrls = m;
    return () => setTimeout(() => m.forEach((u) => URL.revokeObjectURL(u)), 4000);
  });

  function setResources(next: Resources) {
    resources = next;
    if (!start) saveDraftResources(next);
  }

  /** Copia archivos a un estante y devuelve sus rutas (en el mismo orden). */
  function addResources(files: File[], shelf: ResourceDir): string[] {
    const next = new Map(resources);
    const paths = files.map((f) => {
      const path = resourcePath(shelf, f.name, (p) => next.has(p));
      next.set(path, f);
      return path;
    });
    setResources(next);
    return paths;
  }

  function removeResource(path: string) {
    const next = new Map(resources);
    next.delete(path);
    setResources(next);
    for (const at of answers.attributes) if (at.icon === path) at.icon = undefined;
    if (answers.costIcon === path) answers.costIcon = undefined;
    for (const f of [answers.fine, ...answers.types.map((t) => t.fine)]) {
      if (f?.images?.background === path) delete f.images.background;
      if (f?.images?.frame === path) delete f.images.frame;
    }
    if (answers.backFine?.images?.background === path) delete answers.backFine.images.background;
    // Una fuente: deja de usarse donde estuviera elegida.
    const font = answers.fonts?.find((x) => x.file === path);
    if (font) {
      answers.fonts = answers.fonts!.filter((x) => x !== font);
      if (answers.adjust.titleFont === font.family) answers.adjust.titleFont = undefined;
      if (answers.adjust.bodyFont === font.family) answers.adjust.bodyFont = undefined;
      for (const f of [answers.fine, ...answers.types.map((t) => t.fine)])
        for (const st of Object.values(f?.texts ?? {})) if (st.font === font.family) delete st.font;
    }
  }

  const shelfItems = (shelf: ShelfId) => [...resourceUrls].filter(([p]) => shelfOf(p) === shelf).map(([path, url]) => ({ path, url }));

  const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  /** Lo que se ve en el hueco del icono: el propio o el provisional. */
  function iconUrl(at: { label: string; color: string; icon?: string }): string | undefined {
    if (at.icon) return resourceUrls.get(at.icon);
    return svgUrl(provisionalIcon(attrKey(at), at.color, answers.adjust.palette.tinta));
  }
  const costUrl = $derived(answers.costIcon ? resourceUrls.get(answers.costIcon) : svgUrl(costSvg(answers.adjust.palette)));

  /** Atributo (índice) o «coste» cuyo icono se está eligiendo en la biblioteca. */
  let picking = $state<number | 'coste' | null>(null);
  let iconReport = $state('');

  function setIcon(target: number | 'coste', path: string | undefined) {
    if (target === 'coste') answers.costIcon = path;
    else if (answers.attributes[target]) answers.attributes[target].icon = path;
    picking = null;
  }

  // ------------------------------------------------------------ fuentes propias

  let fontInput = $state<HTMLInputElement>();
  let fontOver = $state(false);
  /** Fuentes ya cargadas en la página (para enseñar su muestra). */
  const loadedFonts = new Set<string>();

  function addFonts(files: File[]) {
    const fonts = files.filter((f) => FONT_FILE.test(f.name));
    const paths = addResources(fonts, 'fuentes');
    const list = (answers.fonts ??= []);
    fonts.forEach((f, i) => {
      let family = fontFamilyOf(f.name);
      for (let n = 2; list.some((x) => x.family === family); n++) family = `${fontFamilyOf(f.name)} ${n}`;
      answers.fonts!.push({ family, file: paths[i] });
    });
  }

  $effect(() => {
    for (const fnt of answers.fonts ?? []) {
      const blob = resources.get(fnt.file);
      const key = `${fnt.family}|${fnt.file}`;
      if (!blob || loadedFonts.has(key)) continue;
      loadedFonts.add(key);
      blob
        .arrayBuffer()
        .then((buf) => new FontFace(fnt.family, buf).load())
        .then((face) => document.fonts.add(face))
        .catch(() => (error = `No se pudo leer la fuente «${fnt.file}».`));
    }
  });

  /** Iconos nuevos: los que se llaman como un atributo sin icono propio se le asignan solos. */
  function addIcons(files: File[]) {
    const paths = addResources(files, 'iconos');
    const byFile = new Map(files.map((f, i) => [f, paths[i]]));
    const names = answers.attributes.filter((at) => !at.icon && attrKey(at)).map((at) => at.label);
    if (uses('cost') && !answers.costIcon) names.push('Coste');
    const matched = matchByName(files, names);
    for (const [name, file] of matched) {
      if (name === 'Coste' && !answers.attributes.some((at) => at.label === 'Coste')) answers.costIcon = byFile.get(file);
      else {
        const at = answers.attributes.find((x) => x.label === name);
        if (at) at.icon = byFile.get(file);
      }
    }
    iconReport =
      `${files.length} ${files.length === 1 ? 'icono añadido' : 'iconos añadidos'}` +
      (matched.size ? `; puestos por su nombre: ${[...matched.keys()].join(', ')}.` : '. Arrástralos a cada atributo o haz clic en su icono.');
  }

  // ------------------------------------------------------------ trasera

  const backZones = $derived(preview?.project.templates.trasera?.zones ?? []);
  const backPx = $derived(cardPixels({ width: answers.size.width, height: answers.size.height }, 300));
  let pickingBack = $state(false);

  /** El ajuste de una pieza o un texto de la trasera, creándolo si hace falta. */
  function backStyle(kind: 'pieces' | 'texts', id: string): Record<string, unknown> {
    answers.backFine ??= {};
    answers.backFine[kind] ??= {};
    answers.backFine[kind]![id] ??= {};
    return answers.backFine[kind]![id] as Record<string, unknown>;
  }

  function setBackImage(path: string | undefined) {
    answers.backFine ??= {};
    answers.backFine.images ??= {};
    if (path) answers.backFine.images.background = path;
    else delete answers.backFine.images.background;
    pickingBack = false;
  }

  // ------------------------------------------------------------ recorrido tipo a tipo

  const tplZones = $derived(preview?.project.templates[typeKey({ label: previewLabel(currentType?.label) })]?.zones ?? []);
  const tour = $derived(tourElements(tplZones));
  /** Elemento del recorrido; puede pasarse del final (volviendo hacia atrás) y se ajusta al dibujar. */
  let tourEl = $state(0);
  /** Zona a la que se salta al retomar desde una carta: se busca su elemento en cuanto se dibuja la plantilla. */
  let jumpZone = start?.jump?.zone ?? '';
  $effect(() => {
    if (!jumpZone || !tour.length) return;
    const i = tour.findIndex((e) => e.zones.includes(jumpZone));
    if (i >= 0) tourEl = i;
    jumpZone = '';
  });
  const tourAt = $derived(Math.min(tourEl, Math.max(0, tour.length - 1)));

  /** Avanza (o retrocede) un elemento; devuelve false si ya no quedan y hay que cambiar de paso. */
  function tourMove(dir: number): boolean {
    // Mientras se dibuja la plantilla no se sabe qué elementos tiene: se espera.
    if (!tour.length) return true;
    const at = tourAt + dir;
    if (at >= 0 && at < tour.length) {
      tourEl = at;
      return true;
    }
    const type = current + dir;
    if (type < 0 || type >= answers.types.length) return false;
    current = type;
    tourEl = dir > 0 ? 0 : Number.MAX_SAFE_INTEGER;
    return true;
  }

  const lib: Library = {
    items: (shelf) => shelfItems(shelf),
    add: (files, shelf) => addResources(files, shelf),
    remove: (path) => removeResource(path),
    url: (path) => (path ? resourceUrls.get(path) : undefined),
  };

  // ------------------------------------------------------------ tabla

  let lang = $state('');
  const tableLang = $derived(answers.langs.includes(lang) ? lang : answers.langs[0]);
  // El encuadre va en el CSV pero se ajusta arrastrando la imagen, junto a la vista previa.
  const columns = $derived<TableColumn[]>(currentType ? tableColumns(answers, [currentType], tableLang).filter((c) => c.kind !== 'crop') : []);

  /** Imagen propia de la carta seleccionada y forma de su zona, para encuadrarla. */
  let cropImage = $state.raw<{ src: string; aspect: number } | null>(null);
  $effect(() => {
    const t = currentType;
    const path = t && focus ? cell(t, row, 'ilustracion') : '';
    const art = tplZones.find((z) => z.id === 'ilustracion');
    const lp = preview;
    if (!path || !art || !lp || art.type !== 'image' || art.bleed) return void (cropImage = null);
    let cancelled = false;
    lp.assets.image(path).then((img) => {
      if (!cancelled) cropImage = img ? { src: img.src, aspect: art.rect.w / art.rect.h } : null;
    });
    return () => (cancelled = true);
  });
  const ids = $derived(cardIds(answers.types));
  let csvInput: HTMLInputElement;
  let importReport = $state<ImportReport | null>(null);

  function cell(t: TypeAnswer, k: number, key: string): string {
    return t.cards?.[k]?.[key] ?? '';
  }

  function setCell(t: TypeAnswer, k: number, key: string, v: string) {
    t.cards ??= [];
    while (t.cards.length <= k) t.cards.push({});
    if (v.trim()) t.cards[k][key] = v;
    else delete t.cards[k][key];
  }

  /** Lo que se usará si la celda se queda vacía. */
  function placeholder(c: TableColumn, k: number): string {
    const label = previewLabel(currentType?.label);
    const ph = PLACEHOLDERS[tableLang] ?? PLACEHOLDERS.es;
    const base = c.key.replace(/-[a-z]{2}$/, '');
    if (c.key === 'id') return ids[current]?.(k + 1) ?? '';
    if (base === 'titulo') return `${label} ${k + 1}`;
    if (base === 'subtipo') return label;
    if (base === 'descripcion') return ph.rules;
    if (base === 'sabor') return ph.flavor;
    if (c.kind === 'image') return 'provisional';
    if (c.key === 'copias') return '1';
    return '';
  }

  function addCard() {
    if (!currentType || currentType.count >= MAX_ROWS_PER_TYPE) return;
    currentType.count++;
    row = currentType.count - 1;
  }

  function removeCard(k: number) {
    if (!currentType || currentType.count <= 1) return;
    currentType.cards?.splice(k, 1);
    currentType.count--;
    row = Math.min(row, currentType.count - 1);
  }

  async function importFile(file: File) {
    try {
      const { types, report } = importCsv($state.snapshot(answers) as WizardAnswers, await file.text(), current);
      answers.types = types;
      importReport = report;
      row = 0;
      if (!Object.keys(report.byType).length) error = 'No se ha importado ninguna carta: revisa que la columna «tipo» use los nombres de tus tipos.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function downloadCsv() {
    const csv = fillCsv($state.snapshot(answers) as WizardAnswers);
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${slug(answers.name)}-cartas.csv`);
  }

  // ------------------------------------------------------------ imágenes

  const fileKeyOf = (label: string | undefined) => fileKey(label?.trim() || 'criatura');

  /** Ruta dentro de la carpeta elegida → archivo. Solo en memoria: no se guarda en el borrador. */
  let imageMap = $state.raw<Map<string, Blob>>(start?.images ?? new Map());
  let byOrder = $state(true);
  let match = $state.raw<MatchResult | null>(null);
  let folderInput: HTMLInputElement;
  const imagePaths = $derived([...imageMap.keys()].map((p) => `${IMAGES_DIR}/${p}`));

  function cardRefs(): CardRef[] {
    return answers.types.flatMap((t, type) =>
      Array.from({ length: t.count }, (_, index) => ({
        type,
        index,
        id: cell(t, index, 'id') || ids[type]?.(index + 1) || '',
        titles: answers.langs.map((l) => cell(t, index, textKey('titulo', l, answers.langs))).filter(Boolean),
      })),
    );
  }

  function runMatch() {
    const result = matchImages(cardRefs(), [...imageMap.keys()], answers.types.map((t) => t.label), byOrder);
    answers.types.forEach((t, type) => {
      for (let index = 0; index < t.count; index++) {
        const path = result.assigned.get(cardRefKey(type, index));
        if (path) setCell(t, index, 'ilustracion', `${IMAGES_DIR}/${path}`);
      }
    });
    match = result;
  }

  function pickFolder(list: FileList | null) {
    if (!list?.length) return;
    const map = new Map<string, File>();
    for (const file of Array.from(list)) {
      // Rutas relativas a la carpeta elegida: «criatura/01.png».
      const path = (file.webkitRelativePath || file.name).split('/').slice(1).join('/') || file.name;
      if (IMAGE_FILE.test(path)) map.set(path, file);
    }
    imageMap = map;
    runMatch();
  }

  let dropOver = $state(false);

  /** Imágenes o una carpeta soltadas: se suman a las que ya hay y se vuelve a emparejar. */
  async function dropImages(e: DragEvent) {
    dropOver = false;
    e.preventDefault();
    const list = await droppedEntries(e);
    if (!list.length) return;
    // Si se suelta una sola carpeta, las rutas son relativas a ella, como al elegirla.
    const tops = new Set(list.map((d) => (d.path.includes('/') ? d.path.split('/')[0] : '')));
    const strip = tops.size === 1 && !tops.has('');
    const map = new Map(imageMap);
    for (const d of list) map.set(strip ? d.path.split('/').slice(1).join('/') : d.path, d.file);
    imageMap = map;
    runMatch();
  }

  /** Cartas que apuntan a imágenes de la carpeta que no están cargadas (p. ej. tras recargar la página). */
  function pendingImages(): number {
    let n = 0;
    for (const t of answers.types)
      for (const c of t.cards ?? []) {
        const img = c.ilustracion ?? '';
        if (img.startsWith(`${IMAGES_DIR}/`) && !imageMap.has(img.slice(IMAGES_DIR.length + 1))) n++;
      }
    return n;
  }

  const imageStats = $derived(
    answers.types.map((t) => {
      let own = 0;
      for (let k = 0; k < t.count; k++) if (cell(t, k, 'ilustracion')) own++;
      return { label: t.label, own, total: t.count };
    }),
  );

  // ------------------------------------------------------------ crear

  const summary = $derived.by(() => {
    const cards = answers.types.reduce((s, t) => s + (t.count || 0), 0);
    let written = 0;
    for (const t of answers.types) for (const c of (t.cards ?? []).slice(0, t.count)) if (Object.keys(c).some((k) => k !== 'id' && k !== 'ilustracion')) written++;
    const images = imageStats.reduce((s, x) => s + x.own, 0);
    return { cards, types: answers.types.length, written, images };
  });

  /** El proyecto completo: archivos generados más las imágenes elegidas que usa alguna carta. */
  function files(): Record<string, string | Blob> {
    const snap = $state.snapshot(answers) as WizardAnswers;
    const used = new Set(snap.types.flatMap((t) => (t.cards ?? []).map((c) => c.ilustracion ?? '')));
    const images = new Map([...imageMap].filter(([p]) => used.has(`${IMAGES_DIR}/${p}`)));
    const built = buildProject(snap);
    return {
      ...projectFiles(built),
      ...resourceFiles(resources),
      ...imageFiles(images),
      // Con él, el proyecto se puede retomar después en el asistente.
      [WIZARD_FILE]: newWizardFile(built, snap, 'crear'),
    };
  }

  // ------------------------------------------------------------ repaso final

  interface Review {
    done: number;
    total: number;
    /** Avisos de cada carta que los tiene (texto que no cabe, imagen que falta…). */
    cards: { id: string; type: number; index: number; warnings: string[] }[];
    pending: PendingItem[];
  }
  let review = $state<Review | null>(null);

  /** Al llegar a «Crear», se dibujan todas las cartas en pequeño para ver qué falla antes de crear. */
  $effect(() => {
    if (stepId !== 'crear') return;
    const all = files();
    const snap = $state.snapshot(answers) as WizardAnswers;
    let cancelled = false;
    (async () => {
      const lp = await loadProject(new MemorySource('repaso', all));
      const r: Review = { done: 0, total: lp.rows.length, cards: [], pending: pendingItems(lp) };
      review = r;
      const counters = new Map<string, number>();
      for (const row of lp.rows) {
        if (cancelled) break;
        const type = snap.types.findIndex((t) => typeKey(t) === normalizeKey(row.tipo ?? ''));
        const index = counters.get(row.tipo ?? '') ?? 0;
        counters.set(row.tipo ?? '', index + 1);
        const { warnings } = await renderCard(row, lp, { dpi: 30, lang: lp.langs[0] ?? '', bleed: false });
        r.done++;
        if (warnings.length) r.cards.push({ id: row.id ?? '', type, index, warnings: [...new Set(warnings)] });
        if (r.done % 8 === 0 || r.done === r.total) review = { ...r, cards: [...r.cards] };
      }
      lp.assets.dispose();
    })();
    return () => (cancelled = true);
  });

  function goToCard(type: number, index: number) {
    if (type < 0) return;
    current = type;
    row = index;
    go(stepIndex('cartas'));
  }

  // ------------------------------------------------------------ retomar un proyecto

  const writable = !!start?.source.write;
  const changed = $derived(!!start && JSON.stringify($state.snapshot(answers)) !== initial);
  /** Plantillas retocadas a mano que el asistente cambiaría: se pregunta qué hacer con cada una. */
  const conflicts = $derived.by(() => {
    if (!start || stepId !== 'crear') return [];
    return handEdited(start.project, buildProject($state.snapshot(answers) as WizardAnswers).project, start.file.generated);
  });
  /** Plantillas retocadas que se regeneran (por defecto se conservan). */
  let regenerate = $state<string[]>([]);

  /** Recursos nuevos (o cambiados) respecto a lo que ya había en la carpeta. */
  function freshFiles(): Record<string, Blob> {
    const res = new Map([...resources].filter(([p, b]) => start?.resources.get(p) !== b));
    const img = new Map([...imageMap].filter(([p, b]) => start?.images.get(p) !== b));
    return { ...resourceFiles(res), ...imageFiles(img) };
  }

  /** Guarda las respuestas en la carpeta sin tocar el proyecto: se seguirá desde aquí. */
  const saveInProject = () =>
    run('Guardando…', async () => {
      if (!start?.source.write) return;
      await start.source.requestWrite?.();
      for (const [path, data] of Object.entries(freshFiles())) await start.source.write(path, data);
      const snap = $state.snapshot(answers) as WizardAnswers;
      await start.source.write(WIZARD_FILE, wizardFileJson({ answers: snap, step: stepId, generated: start.file.generated }));
      notice = 'Guardado en la carpeta del proyecto, sin aplicar: la próxima vez que abras el asistente seguirás aquí.';
    });

  const applyToProject = () =>
    run('Aplicando…', async () => {
      const src = start?.source;
      if (!start || !src?.write) return;
      const write = src.write.bind(src);
      await src.requestWrite?.();
      const snap = $state.snapshot(answers) as WizardAnswers;
      const built = buildProject(snap);
      const keep = new Set(conflicts.filter((k) => !regenerate.includes(k)));
      const res = applyAll({ project: start.project }, start.csv, built, snap, 'crear', start.file.generated, keep);
      for (const [path, data] of Object.entries({ ...built.files, ...freshFiles() })) await write(path, data);
      await write(res.project.csv, res.csv);
      await write(PROJECT_FILE, serializeProject(res.project));
      await write(WIZARD_FILE, res.wizard);
      oncreate(src, keep.size ? `Cambios aplicados. Se han conservado tus retoques en: ${[...keep].join(', ')}.` : 'Cambios del asistente aplicados al proyecto.');
    });

  function leave() {
    if (changed && !confirm('Hay cambios del asistente sin aplicar. ¿Salir sin aplicarlos?')) return;
    oncancel();
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

{#snippet card(lp: LoadedProject | null | undefined, label: string, o: RenderOptions, back = false, index = 0)}
  {@const r = back ? backRow(lp ?? null, label) : rowOfType(lp ?? null, label, index)}
  {#if lp && r}
    <CardView row={r} {lp} opts={{ ...o, lang: (stepId === 'cartas' && tableLang) || lp.langs[0] || '' }} />
  {:else}
    <div class="placeholder">Dibujando…</div>
  {/if}
{/snippet}

{#snippet reviewPanel()}
  <div class="field review">
    <span>Repaso</span>
    {#if !review}
      <p class="hint">Preparando…</p>
    {:else}
      {#if review.done < review.total}
        <p class="hint">Revisando las cartas: {review.done} de {review.total}…</p>
      {:else if !review.cards.length && !review.pending.length}
        <p class="ok">Todo en orden: {review.total} cartas revisadas, sin avisos ni nada pendiente.</p>
      {:else}
        <p class="hint">{review.total} cartas revisadas.</p>
      {/if}
      {#if review.cards.length}
        <ul class="issues">
          {#each review.cards.slice(0, 30) as c}
            <li>
              <button class="link" onclick={() => goToCard(c.type, c.index)} disabled={c.type < 0}>{c.id || `carta ${c.index + 1}`}</button>: {c.warnings.join('; ')}
            </li>
          {/each}
          {#if review.cards.length > 30}<li>… y {review.cards.length - 30} más.</li>{/if}
        </ul>
      {/if}
      {#if review.pending.length}
        <p class="hint">Pendiente (se rellena con ejemplos y podrás terminarlo después):</p>
        <ul class="issues">
          {#each review.pending as it}<li>{it.label}</li>{/each}
        </ul>
      {/if}
    {/if}
  </div>
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

<input type="file" hidden accept=".json,application/json" bind:this={progressInput} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) loadProgress(f); e.currentTarget.value = ''; }} />
<input type="file" hidden accept=".csv,.txt,text/csv" bind:this={csvInput} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) importFile(f); e.currentTarget.value = ''; }} />
<input type="file" hidden multiple bind:this={folderInput} {...{ webkitdirectory: true }} onchange={(e) => { pickFolder(e.currentTarget.files); e.currentTarget.value = ''; }} />
<datalist id="wz-images">{#each imagePaths as p}<option value={p}></option>{/each}</datalist>

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
      {#if start}
        <p class="hint">Proyecto «{start.source.label}»{changed ? ' · cambios sin aplicar' : ''}</p>
        {#if writable}
          <button class="small" onclick={saveInProject} disabled={!!busy} title="Guarda tus respuestas en la carpeta del proyecto sin cambiar las cartas">Guardar sin aplicar</button>
        {/if}
        <button class="ghost small" onclick={saveProgress} title="Descarga un archivo con tus respuestas">Descargar progreso</button>
        <button class="ghost small" onclick={leave}>Salir</button>
      {:else}
        <button class="small" onclick={saveProgress} title="Descarga un archivo para seguir otro día o en otro ordenador">Guardar progreso</button>
        <button class="ghost small" onclick={() => progressInput.click()}>Cargar progreso…</button>
        <button class="ghost small" onclick={restart}>Empezar de cero</button>
        <button class="ghost small" onclick={oncancel}>Salir</button>
      {/if}
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
              <td><input type="text" bind:value={t.label} placeholder={i === 0 ? 'p. ej. Criatura' : 'p. ej. Hechizo'} /></td>
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
          <span>¿Qué atributos y habilidades existen en tu juego?</span>
          <p class="hint">
            Hay dos clases: <b>con número</b>, que cambia en cada carta (Ataque 3, Vida 5), y <b>solo icono</b>, una habilidad que la
            carta tiene o no (Volar, Veneno). Las habilidades van en su propia fila. En los textos, <code>{'{ataque}'}</code> dibuja su
            icono.
          </p>
          <p class="hint">
            ¿Buscas una categoría como clan, facción o rareza? Eso no es un atributo: vuelve al paso anterior y marca «Rareza, clan o
            facción».
          </p>
          {#each answers.attributes as at, i}
            <div class="row attr">
              <ResourceSlot
                url={iconUrl(at)}
                label={at.label || 'atributo'}
                custom={!!at.icon}
                active={picking === i}
                onclick={() => (picking = picking === i ? null : i)}
                onfile={(f) => setIcon(i, addResources([f], 'iconos')[0])}
                onpath={(p) => setIcon(i, p)}
              />
              <input type="color" bind:value={at.color} title="Color del icono provisional" />
              <input type="text" value={at.label} oninput={(e) => renameAttr(i, e.currentTarget.value)} placeholder="Nombre" />
              <div class="seg small-seg" role="group" aria-label="Clase de {at.label}">
                <button class:active={!isAbility(at)} onclick={() => (at.kind = 'number')} title="Un número que cambia en cada carta">Con número</button>
                <button class:active={isAbility(at)} onclick={() => (at.kind = 'icon')} title="La carta la tiene o no">Solo icono</button>
              </div>
              <button class="ghost small" onclick={() => moveAttr(i, -1)} disabled={i === 0} title="Subir" aria-label="Subir {at.label}">↑</button>
              <button class="ghost small" onclick={() => moveAttr(i, 1)} disabled={i === answers.attributes.length - 1} title="Bajar" aria-label="Bajar {at.label}">↓</button>
              <button class="ghost small" onclick={() => removeAttr(i)} title="Quitar">✕</button>
            </div>
          {/each}
          {#if answers.attributes.length > 1}
            <p class="hint">El orden de esta lista es el orden en que aparecen en la carta.</p>
          {/if}
          <div class="row">
            <button class="small" onclick={() => answers.attributes.push({ label: '', color: ATTR_COLORS[answers.attributes.length % ATTR_COLORS.length] })}>
              ＋ Con número
            </button>
            <button class="small" onclick={() => answers.attributes.push({ label: '', color: ATTR_COLORS[answers.attributes.length % ATTR_COLORS.length], kind: 'icon' })}>
              ＋ Solo icono
            </button>
          </div>
        </div>
        {@const named = answers.attributes.filter((at) => attrKey(at))}
        {@const statTypes = answers.types.filter((t) => !t.sameAs && t.elements.includes('stats'))}
        <div class="field">
          <span>¿Qué atributos lleva cada tipo de carta?</span>
          {#if named.length}
            <p class="hint">
              Marca las casillas: los atributos con número aparecen en todas las cartas de ese tipo; las habilidades, en las cartas que
              las tengan (lo marcarás en la tabla de cartas).
            </p>
            <div class="matrix-wrap">
              <table class="matrix">
                <thead>
                  <tr>
                    <th></th>
                    {#each named as at}<th><img src={iconUrl(at)} alt="" />{at.label}{#if isAbility(at)}<small>solo icono</small>{/if}</th>{/each}
                  </tr>
                </thead>
                <tbody>
                  {#each statTypes as t}
                    <tr>
                      <th>{t.label || 'Sin nombre'}</th>
                      {#each named as at}
                        <td>
                          <input
                            type="checkbox"
                            checked={t.attributes.includes(attrKey(at))}
                            onchange={() => toggleAttr(t, attrKey(at))}
                            aria-label="{at.label} en {t.label}"
                          />
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="hint warn">Todavía no hay atributos: añade al menos uno en la lista de arriba.</p>
          {/if}
          {#if answers.types.some((t) => t.sameAs)}
            <p class="hint">Los tipos «igual que» otro usan los atributos de ese tipo.</p>
          {/if}
        </div>
      {/if}
      {#if uses('cost')}
        <div class="field">
          <span>Coste</span>
          <div class="row attr">
            <ResourceSlot
              url={costUrl}
              label="Coste"
              custom={!!answers.costIcon}
              active={picking === 'coste'}
              onclick={() => (picking = picking === 'coste' ? null : 'coste')}
              onfile={(f) => setIcon('coste', addResources([f], 'iconos')[0])}
              onpath={(p) => setIcon('coste', p)}
            />
            <p class="hint">El <b>coste</b> es un número con su propio icono, en una esquina. Su valor va en la misma columna que los atributos: <code>coste:3</code>.</p>
          </div>
        </div>
      {/if}
      {#if uses('stats') || uses('cost')}
        <div class="field">
          <span>Tus iconos</span>
          {#if picking !== null}
            {@const name = picking === 'coste' ? 'Coste' : answers.attributes[picking]?.label || 'este atributo'}
            <p class="hint pick">
              Elige el icono de <b>{name}</b>, o añade uno nuevo.
              {#if picking === 'coste' ? answers.costIcon : answers.attributes[picking]?.icon}
                <button class="ghost small" onclick={() => setIcon(picking!, undefined)}>Volver al provisional</button>
              {/if}
              <button class="ghost small" onclick={() => (picking = null)}>Cancelar</button>
            </p>
          {:else}
            <p class="hint">
              Suelta aquí tus iconos (PNG con transparencia o SVG), o una carpeta entera. Los que se llamen como un atributo se ponen
              solos (<code>volar.png</code> → Volar); los demás, arrástralos a su atributo o haz clic en el icono del atributo para
              elegirlo.
            </p>
          {/if}
          <ResourceShelf
            items={shelfItems('iconos')}
            compact
            selected={picking === null ? '' : ((picking === 'coste' ? answers.costIcon : answers.attributes[picking]?.icon) ?? '')}
            onpick={picking === null ? undefined : (p) => setIcon(picking!, p)}
            onadd={(files) => {
              if (picking !== null) setIcon(picking, addResources(files, 'iconos')[0]);
              else addIcons(files);
            }}
            onremove={removeResource}
            empty="Sin iconos propios: se usan los provisionales, de colores."
          />
          {#if iconReport}<div class="report">{iconReport} <button class="ghost small" onclick={() => (iconReport = '')}>✕</button></div>{/if}
        </div>
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
        <div
          class="fonts dropzone"
          class:over={fontOver}
          role="region"
          aria-label="Tus fuentes"
          ondragover={(e) => {
            if (acceptsDrop(e)) {
              e.preventDefault();
              fontOver = true;
            }
          }}
          ondragleave={() => (fontOver = false)}
          ondrop={async (e) => {
            fontOver = false;
            e.preventDefault();
            const files = [...(e.dataTransfer?.files ?? [])].filter((f) => FONT_FILE.test(f.name));
            if (files.length) addFonts(files);
          }}
        >
          <b>Tus fuentes</b>
          {#each answers.fonts ?? [] as fnt}
            <div class="font-row">
              <span class="sample" style:font-family={`"${fnt.family}", sans-serif`}>Aa Bb 123 — {fnt.family}</span>
              <button class="ghost small" onclick={() => removeResource(fnt.file)} title="Quitar" aria-label="Quitar {fnt.family}">✕</button>
            </div>
          {:else}
            <p class="hint">Suelta aquí archivos TTF, OTF o WOFF (o elígelos) para usar tus propias fuentes. Revisa que su licencia permita usarlas en tu juego.</p>
          {/each}
          <div class="row">
            <button class="small" onclick={() => fontInput?.click()}>＋ Añadir fuentes…</button>
            {#if answers.fonts?.length}
              <label class="inline">
                Títulos con
                <select bind:value={answers.adjust.titleFont} aria-label="Fuente de los títulos">
                  <option value={undefined}>la de la combinación</option>
                  {#each answers.fonts as fnt}<option value={fnt.family}>{fnt.family}</option>{/each}
                </select>
              </label>
              <label class="inline">
                Textos con
                <select bind:value={answers.adjust.bodyFont} aria-label="Fuente de los textos">
                  <option value={undefined}>la de la combinación</option>
                  {#each answers.fonts as fnt}<option value={fnt.family}>{fnt.family}</option>{/each}
                </select>
              </label>
            {/if}
          </div>
          <input
            type="file"
            hidden
            multiple
            accept=".ttf,.otf,.woff,.woff2"
            bind:this={fontInput}
            onchange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              e.currentTarget.value = '';
              if (files.length) addFonts(files);
            }}
          />
        </div>
        <p class="hint">En el recorrido «Tipo a tipo» puedes elegir la fuente de cada texto por separado.</p>
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
    {:else if stepId === 'recorrido'}
      <h2>Tipo a tipo</h2>
      <p class="lead">
        Repasamos cada tipo, elemento por elemento. Ajusta lo que quieras y pulsa «Siguiente»; lo que no toques se queda como en el
        diseño. Puedes volver aquí cuando quieras.
      </p>
      {@render typeTabs()}
      {#if tour.length}
        <TypeTour
          bind:answers
          {current}
          element={tourAt}
          elements={tour}
          zones={tplZones}
          {lib}
          {iconUrl}
          {costUrl}
          {setIcon}
          ongo={(type, el) => {
            current = type;
            tourEl = el;
          }}
        />
      {:else}
        <p class="hint">Dibujando…</p>
      {/if}
      <p class="hint">
        <button class="ghost small" onclick={() => go(stepIndex('traseras'))}>Saltar el resto del recorrido</button>
        <button class="ghost small" onclick={() => { if (confirm('¿Quitar todos los ajustes del recorrido (de todos los tipos)?')) { answers.fine = { pieces: {}, texts: {} }; for (const t of answers.types) t.fine = undefined; } }}>Quitar todos los ajustes</button>
      </p>
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
      {#if answers.backs !== 'none'}
        {@const bz = (id: string) => backZones.find((z) => z.id === id)}
        {@const bf = answers.backFine ?? {}}
        <div class="field">
          <span>Dibujo del dorso</span>
          <div class="row">
            <ResourceSlot
              url={bf.images?.background ? resourceUrls.get(bf.images.background) : undefined}
              label="Dibujo del dorso"
              custom={!!bf.images?.background}
              active={pickingBack}
              size={56}
              onclick={() => (pickingBack = !pickingBack)}
              onfile={(f) => setBackImage(addResources([f], 'fondos')[0])}
              onpath={(p) => setBackImage(p)}
            />
            <p class="hint">
              Una imagen para todo el dorso, con sangrado (por ejemplo, {backPx.width} × {backPx.height} px a 300 ppp). Sin ella se usa un
              dibujo provisional.
              {#if bf.images?.background}<button class="ghost small" onclick={() => setBackImage(undefined)}>Volver al provisional</button>{/if}
            </p>
          </div>
          {#if pickingBack}
            <ResourceShelf
              compact
              items={shelfItems('fondos')}
              selected={bf.images?.background ?? ''}
              onpick={(p) => setBackImage(p)}
              onadd={(files) => setBackImage(addResources(files, 'fondos')[0])}
              onremove={removeResource}
              empty="Sin fondos: suelta aquí la imagen del dorso."
            />
          {/if}
        </div>
        <div class="field">
          <span>Banda y textos</span>
          {#if bz('banda')?.type === 'shape'}
            <PieceControls zone={bz('banda') as never} style={bf.pieces?.banda ?? {}} label="Banda" palette={answers.adjust.palette} onchange={(p) => Object.assign(backStyle('pieces', 'banda'), p)} />
          {/if}
          {#each [['nombre', 'Nombre del juego'], ['tipo', 'Nombre del tipo']] as [id, label]}
            {#if bz(id)?.type === 'text'}
              <details>
                <summary>{label}</summary>
                <TextControls
                  zone={bz(id) as never}
                  style={bf.texts?.[id] ?? {}}
                  {label}
                  palette={answers.adjust.palette}
                  fonts={fontStack(answers)}
                  custom={(answers.fonts ?? []).map((x) => x.family)}
                  onchange={(p) => Object.assign(backStyle('texts', id), p)}
                />
              </details>
            {/if}
          {/each}
          <p class="hint">Con un dibujo propio que ya lleve el nombre, puedes dejar la banda transparente y sin borde.</p>
        </div>
      {/if}
    {:else if stepId === 'cartas'}
      <h2>Las cartas</h2>
      <p class="lead">
        Cada fila es una carta. Todo se guarda como una <b>tabla</b> (un archivo CSV) que también puedes abrir con Excel o Google Sheets.
        Lo que dejes vacío se rellena con un texto de ejemplo y queda como pendiente.
      </p>
      <div class="toolbar">
        {@render typeTabs()}
        {#if answers.langs.length > 1}
          <div class="tabs">
            {#each answers.langs as l}<button class:active={tableLang === l} onclick={() => (lang = l)}>{l.toUpperCase()}</button>{/each}
          </div>
        {/if}
        <span class="grow"></span>
        <button class="small" onclick={downloadCsv} title="Una fila por carta y una columna por campo, para rellenarla con calma">Descargar CSV para rellenar</button>
        <button class="small" onclick={() => csvInput.click()}>Importar CSV…</button>
      </div>
      {#if importReport}
        <div class="report">
          Importadas: {Object.entries(importReport.byType).map(([t, n]) => `${n} de «${t}»`).join(', ') || 'ninguna'}.
          {#if importReport.unknownTypes.length}<br />Tipos que no existen en el asistente (filas ignoradas): {importReport.unknownTypes.join(', ')}.{/if}
          {#if importReport.ignored.length}<br />Columnas ignoradas: {importReport.ignored.join(', ')}.{/if}
          <button class="ghost small" onclick={() => (importReport = null)}>✕</button>
        </div>
      {/if}
      {#if currentType}
        <div class="grid-wrap">
          <table class="cards">
            <thead>
              <tr>
                <th>#</th>
                {#each columns as c}<th class={c.kind}>{c.label}</th>{/each}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each Array.from({ length: currentType.count }, (_, k) => k) as k (k)}
                <tr class:selected={k === row} onfocusin={() => (row = k)} onclick={() => (row = k)}>
                  <td class="n">{k + 1}</td>
                  {#each columns as c (c.key)}
                    <td class={c.kind}>
                      {#if c.kind === 'long'}
                        <textarea rows="2" value={cell(currentType, k, c.key)} placeholder={placeholder(c, k)} oninput={(e) => setCell(currentType, k, c.key, e.currentTarget.value)}></textarea>
                      {:else if c.kind === 'flag'}
                        <input
                          type="checkbox"
                          checked={flagOn(cell(currentType, k, c.key))}
                          onchange={(e) => setCell(currentType, k, c.key, e.currentTarget.checked ? 'x' : '')}
                          aria-label="{c.label} en la carta {k + 1}"
                        />
                      {:else if c.kind === 'variant'}
                        <select value={cell(currentType, k, c.key)} onchange={(e) => setCell(currentType, k, c.key, e.currentTarget.value)}>
                          <option value="">(automática)</option>
                          {#each answers.variant.values.filter((v) => v.name.trim()) as v}<option value={v.name}>{v.name}</option>{/each}
                        </select>
                      {:else}
                        <input
                          type="text"
                          list={c.kind === 'image' ? 'wz-images' : undefined}
                          value={cell(currentType, k, c.key)}
                          placeholder={placeholder(c, k)}
                          oninput={(e) => setCell(currentType, k, c.key, e.currentTarget.value)}
                        />
                      {/if}
                    </td>
                  {/each}
                  <td><button class="ghost small" title="Quitar esta carta" onclick={() => removeCard(k)} disabled={currentType.count <= 1}>✕</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button class="small" onclick={addCard}>＋ Carta</button>
        <p class="hint">
          En las reglas: <code>**negrita**</code>, <code>*cursiva*</code> y <code>{'{atributo}'}</code> para poner su icono. Los números vacíos se
          rellenan con valores de ejemplo; las habilidades, solo si marcas la casilla (las cartas que aún no has tocado llevan algunas de ejemplo). ¿Mucho que escribir? Descarga el CSV, rellénalo con calma, guarda el progreso y vuelve otro día a importarlo.
        </p>
      {/if}
    {:else if stepId === 'imagenes'}
      <h2>Imágenes</h2>
      <p class="lead">¿Tienes ya las ilustraciones? Si no, se usan las provisionales y podrás cambiarlas cuando quieras.</p>
      <div class="field">
        <span>Elige la carpeta con tus imágenes</span>
        <p class="hint">Se emparejan solas con las cartas, en este orden:</p>
        <ol class="rules">
          <li>El nombre del archivo es el <b>id</b> de la carta: <code>{ids[0]?.(1) ?? 'CRI-001'}.png</code></li>
          <li>El nombre del archivo es el <b>título</b>: <code>guardian-de-ceniza.jpg</code> (sin importar mayúsculas, tildes ni espacios).</li>
          <li>
            <label class="check">
              <input type="checkbox" bind:checked={byOrder} onchange={() => imageMap.size && runMatch()} />
              Las demás, por <b>orden alfabético</b> dentro de una subcarpeta con el nombre del tipo: <code>{fileKeyOf(answers.types[0]?.label)}/01.png</code>
            </label>
          </li>
        </ol>
        <div
          class="row dropzone"
          class:over={dropOver}
          role="region"
          aria-label="Soltar imágenes"
          ondragover={(e) => {
            if (acceptsDrop(e)) {
              e.preventDefault();
              dropOver = true;
            }
          }}
          ondragleave={() => (dropOver = false)}
          ondrop={dropImages}
        >
          <button class="primary" onclick={() => folderInput.click()}>Elegir carpeta de imágenes…</button>
          <span class="hint">o suéltala aquí (también imágenes sueltas)</span>
          {#if imageMap.size}<button class="small" onclick={runMatch}>Volver a emparejar</button>{/if}
        </div>
        <p class="hint">Las imágenes no se suben a ningún sitio: se copian a la carpeta del proyecto al crearlo (en <code>assets/{IMAGES_DIR}/</code>).</p>
      </div>
      {#if match}
        <div class="report">
          {imageMap.size} imágenes: {match.byRule.id} por id, {match.byRule.title} por título, {match.byRule.order} por orden.
          {#if match.unused.length}<br />Sin usar ({match.unused.length}): {match.unused.slice(0, 8).join(', ')}{match.unused.length > 8 ? '…' : ''}{/if}
        </div>
      {/if}
      {#if pendingImages()}
        <p class="warn">{pendingImages()} cartas usan imágenes de una carpeta que ya no está cargada: vuelve a elegirla.</p>
      {/if}
      <table class="fine">
        <tbody>
          {#each imageStats as st, i}
            <tr>
              <th>{st.label}</th>
              <td>{st.own} de {st.total} con imagen propia</td>
              <td><button class="ghost small" onclick={() => { current = i; go(stepIndex('cartas')); }}>Revisar en la tabla</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">Puedes cambiar la imagen de cualquier carta en la columna «Ilustración» de la tabla.</p>
    {:else if start}
      <h2>Aplicar los cambios</h2>
      <ul class="summary">
        <li><b>{answers.name}</b> · {answers.size.width} × {answers.size.height} mm + 3 mm de sangrado</li>
        <li>{summary.types} {summary.types === 1 ? 'tipo' : 'tipos'} y {summary.cards} cartas: {labels.join(', ')}</li>
        <li>{summary.written} de {summary.cards} cartas con datos propios · {summary.images} con ilustración propia</li>
      </ul>
      <p class="lead">
        Se actualizan las plantillas, los atributos, los colores y la tabla del proyecto «{start.source.label}». Lo que el asistente no
        conoce se queda como está: columnas propias del CSV, tipos y plantillas hechos a mano, fuentes y ajustes de exportación.
      </p>
      {#if conflicts.length}
        <div class="field">
          <span>Plantillas retocadas a mano</span>
          <p class="hint">Estas plantillas se cambiaron en el editor después del asistente. ¿Qué hacemos con cada una?</p>
          {#each conflicts as k}
            <label class="check">
              <input type="checkbox" checked={!regenerate.includes(k)} onchange={(e) => (regenerate = e.currentTarget.checked ? regenerate.filter((x) => x !== k) : [...regenerate, k])} />
              Conservar mis retoques en «{k}» {regenerate.includes(k) ? '(se regenera con el asistente)' : ''}
            </label>
          {/each}
        </div>
      {/if}
      {#if pendingImages()}
        <p class="warn">{pendingImages()} cartas usan imágenes que no están en la carpeta: vuelve al paso «Imágenes».</p>
      {/if}
      {@render reviewPanel()}
      <div class="create">
        {#if writable}
          <button class="primary big" disabled={!!busy} onclick={applyToProject}>Aplicar a «{start.source.label}»</button>
        {:else}
          <p class="hint">Este proyecto no se puede escribir (no está abierto desde una carpeta en Chrome o Edge). Crea uno nuevo con los cambios:</p>
          {#if window.showDirectoryPicker}<button class="primary" disabled={!!busy} onclick={createInFolder}>Guardar en una carpeta…</button>{/if}
          <button disabled={!!busy} onclick={createZip}>Descargar .zip</button>
          <button class="ghost" disabled={!!busy} onclick={tryIt}>Probar sin guardar</button>
        {/if}
      </div>
      {#if busy}<p class="hint">{busy}</p>{/if}
    {:else}
      <h2>Crear el proyecto</h2>
      <ul class="summary">
        <li><b>{answers.name}</b> · {answers.size.width} × {answers.size.height} mm + 3 mm de sangrado</li>
        <li>{summary.types} {summary.types === 1 ? 'tipo' : 'tipos'} y {summary.cards} cartas: {labels.join(', ')}</li>
        <li>Diseño «{DESIGNS.find((d) => d.id === answers.design)?.label}», idiomas: {answers.langs.join(', ')}</li>
        <li>Traseras: {answers.backs === 'common' ? 'una para todas' : answers.backs === 'per-type' ? 'una por tipo' : 'ninguna'}</li>
        <li>{summary.written} de {summary.cards} cartas con datos propios · {summary.images} con ilustración propia</li>
      </ul>
      {#if pendingImages()}
        <p class="warn">{pendingImages()} cartas usan imágenes que no están cargadas: vuelve al paso «Imágenes» y elige la carpeta.</p>
      {/if}
      {@render reviewPanel()}
      <p class="lead">
        Se crea la carpeta del proyecto con tu tabla de cartas y tus imágenes; lo que falte se rellena con ejemplos e imágenes
        provisionales, y el panel de pendientes te dirá qué queda.
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

    {#if notice}<div class="report">{notice} <button class="ghost small" onclick={() => (notice = '')}>✕</button></div>{/if}
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
      <small>{DESIGNS.find((d) => d.id === answers.design)?.label} · {previewLabel(currentType?.label)}</small>
    {:else if focus}
      {@render typeTabs()}
      {@render card(preview, currentType?.label ?? '', opts, false, row)}
      <div class="stepper">
        <button class="small" onclick={() => (row = Math.max(0, row - 1))} disabled={row === 0}>◀</button>
        <small>{previewLabel(currentType?.label)} · carta {row + 1} de {currentType?.count}</small>
        <button class="small" onclick={() => (row = Math.min((currentType?.count ?? 1) - 1, row + 1))} disabled={row >= (currentType?.count ?? 1) - 1}>▶</button>
      </div>
      {#if cropImage && currentType}
        <div class="crop-panel">
          <small>Encuadre de la ilustración: arrastra para mover, la rueda amplía.</small>
          <CropEditor
            src={cropImage.src}
            aspect={cropImage.aspect}
            value={cell(currentType, row, 'encuadre')}
            onchange={(v) => setCell(currentType, row, 'encuadre', v)}
            width={240}
            label="Encuadre de la ilustración"
          />
        </div>
      {/if}
    {:else}
      {#if STEPS[step].id !== 'proyecto' && STEPS[step].id !== 'tipos'}{@render typeTabs()}{/if}
      {@render card(preview, currentType?.label ?? '', stepId === 'recorrido' && tour[tourAt] ? { ...opts, focus: tour[tourAt].zones } : opts)}
      <small>{previewLabel(currentType?.label)} · vista previa</small>
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
  .attr button:disabled {
    visibility: hidden;
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
  .matrix-wrap {
    overflow-x: auto;
  }
  .matrix {
    border-collapse: collapse;
  }
  .matrix th,
  .matrix td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    text-align: center;
    white-space: nowrap;
  }
  .matrix thead th {
    font-weight: normal;
    color: var(--muted);
    font-size: 12px;
  }
  .matrix tbody th {
    text-align: left;
    font-weight: 600;
  }
  .matrix thead img {
    display: block;
    width: 22px;
    height: 22px;
    margin: 0 auto 3px;
    object-fit: contain;
  }
  .matrix thead small {
    display: block;
    font-size: 10px;
    opacity: 0.8;
  }
  .small-seg button {
    padding: 3px 8px;
    font-size: 12px;
  }
  .pick {
    color: var(--text);
  }
  .matrix input {
    width: 16px;
    height: 16px;
  }
  .warn {
    color: var(--warn);
  }
  .crop-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    margin-top: 8px;
  }
  .issues {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.6;
  }
  .ok {
    color: #7bd88f;
    margin: 0;
  }
  .link {
    all: unset;
    cursor: pointer;
    color: var(--accent);
    text-decoration: underline;
  }
  .link:disabled {
    color: inherit;
    text-decoration: none;
    cursor: default;
  }
  details summary {
    cursor: pointer;
    margin: 4px 0;
  }
  .fonts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .font-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sample {
    font-size: 20px;
  }
  .dropzone {
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 12px;
  }
  .dropzone.over {
    border-color: var(--accent);
    background: rgba(76, 125, 255, 0.08);
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
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
  }
  .report {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.5;
    position: relative;
    padding-right: 34px;
  }
  .report > button {
    position: absolute;
    top: 4px;
    right: 4px;
  }
  .grid-wrap {
    overflow: auto;
    max-height: 52vh;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  table.cards {
    border-collapse: collapse;
    font-size: 12px;
    min-width: 100%;
  }
  table.cards thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
    color: var(--muted);
    font-weight: normal;
    text-align: left;
    padding: 6px;
    white-space: nowrap;
    z-index: 1;
  }
  table.cards td {
    padding: 3px;
    border-top: 1px solid var(--border);
    vertical-align: top;
  }
  table.cards td.n {
    color: var(--muted);
    text-align: right;
    padding: 8px 6px;
  }
  table.cards tr.selected {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  table.cards input,
  table.cards select,
  table.cards textarea {
    width: 100%;
    padding: 4px 6px;
    font-size: 12px;
  }
  table.cards textarea {
    font: inherit;
    color: inherit;
    background: #2b2f38;
    border: 1px solid var(--border);
    border-radius: 6px;
    resize: vertical;
  }
  table.cards .id {
    min-width: 90px;
  }
  table.cards .text {
    min-width: 150px;
  }
  table.cards .long {
    min-width: 240px;
  }
  table.cards .number {
    width: 64px;
  }
  table.cards .variant {
    min-width: 110px;
  }
  table.cards .image {
    min-width: 190px;
  }
  table.fine {
    border-collapse: collapse;
  }
  table.fine th {
    text-align: left;
    font-weight: normal;
    padding: 6px 14px 6px 0;
    white-space: nowrap;
  }
  table.fine td {
    padding: 6px 10px 6px 0;
  }
  .rules {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .stepper {
    display: flex;
    gap: 10px;
    align-items: center;
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
