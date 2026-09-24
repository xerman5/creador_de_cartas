import Papa from 'papaparse';
import { layoutZones, artPath } from './designs';
import { artSvg, backSvg, costSvg, iconSvg, shiftColor } from './art';
import { attrKey, fileKey, resolvedType, textKey, typeKey, type CardData, type ElementKey, type FineTune, type WizardAnswers } from './answers';
import { DEFAULT_SAFE_MM } from '../card';
import { PROJECT_FILE, serializeProject } from '../project';
import { normalizeKey } from '../text';
import type { AttributeDef, Project, Template, Zone } from '../types';

/** Textos de relleno: el panel de pendientes los reconoce para avisar de lo que falta escribir. */
export const PLACEHOLDERS: Record<string, { rules: string; flavor: string }> = {
  es: { rules: 'Escribe aquí el texto de reglas.', flavor: 'Una frase de ambientación.' },
  en: { rules: 'Write the rules text here.', flavor: 'A line of flavor text.' },
  fr: { rules: 'Écrivez ici le texte des règles.', flavor: "Une phrase d'ambiance." },
  de: { rules: 'Schreibe hier den Regeltext.', flavor: 'Ein stimmungsvoller Satz.' },
  it: { rules: 'Scrivi qui il testo delle regole.', flavor: 'Una frase di ambientazione.' },
  pt: { rules: 'Escreva aqui o texto das regras.', flavor: 'Uma frase de ambientação.' },
};

export const PROVISIONAL_DIR = 'provisional/';
export const BACK_TEMPLATE = 'trasera';
export const MAX_ROWS_PER_TYPE = 500;

export interface BuiltProject {
  project: Project;
  csv: string;
  /** Archivos del proyecto (rutas desde la raíz), además de proyecto.json y el CSV. */
  files: Record<string, string>;
}

const COST_KEY = 'coste';

/** Forma del icono provisional: fija para cada nombre, para que reordenar no la cambie. */
const KNOWN_SHAPES: Record<string, number> = { ataque: 0, fuerza: 0, dano: 0, vida: 2, salud: 2, defensa: 3, escudo: 3, armadura: 3, magia: 4, poder: 4, velocidad: 1 };
function shapeIndex(key: string): number {
  return KNOWN_SHAPES[key] ?? [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
}

/** Todos los archivos del proyecto, listos para escribir en una carpeta o en un zip. */
export function projectFiles(built: BuiltProject): Record<string, string> {
  return { [PROJECT_FILE]: serializeProject(built.project), [built.project.csv]: built.csv, ...built.files };
}

/** Id por defecto de la carta `k` (desde 1) de cada tipo: «CRI-001». */
export function cardIds(types: { label: string }[]): ((k: number) => string)[] {
  return prefixes(types.map((t) => t.label)).map((p) => (k: number) => `${p}-${String(k).padStart(3, '0')}`);
}

/** Id corto de las cartas de un tipo: «Criatura» → «CRI». Distinto para cada tipo. */
function prefixes(labels: string[]): string[] {
  const used = new Set<string>();
  return labels.map((label) => {
    const base = (fileKey(label).replace(/-/g, '').toUpperCase() + 'XXX').slice(0, 3);
    let p = base;
    for (let n = 2; used.has(p); n++) p = base.slice(0, 2) + n;
    used.add(p);
    return p;
  });
}

function backTemplate(answers: WizardAnswers, f: number): Template {
  const { width: W, height: H } = answers.size;
  const m = DEFAULT_SAFE_MM + 0.5;
  const bandH = Math.min(24 * f, H * 0.3);
  const y = (H - bandH) / 2;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const zones: Zone[] = [
    { id: 'dibujo', type: 'image', default: `${PROVISIONAL_DIR}trasera.svg`, fit: 'cover', bleed: true, locked: true, rect: { x: 0, y: 0, w: W, h: H } },
    {
      id: 'banda',
      type: 'shape',
      fill: 'papel',
      ...(answers.backs === 'per-type' ? { fillBind: 'color' } : {}),
      stroke: 'acento',
      strokeWidth: r2(0.6 * f),
      radius: answers.adjust.rounded ? r2(2 * f) : 0,
      rect: { x: r2(m), y: r2(y), w: r2(W - 2 * m), h: r2(bandH) },
    },
    {
      id: 'nombre',
      type: 'text',
      bind: 'titulo',
      default: answers.name,
      align: 'center',
      valign: 'middle',
      padding: r2(2 * f),
      minSize: r2(7 * f),
      font: { family: 'Georgia, serif', size: r2(16 * f), weight: 'bold', color: 'principal' },
      rect: { x: r2(m), y: r2(y), w: r2(W - 2 * m), h: r2(bandH * (answers.backs === 'per-type' ? 0.66 : 1)) },
    },
  ];
  if (answers.backs === 'per-type') {
    zones.push({
      id: 'tipo',
      type: 'text',
      bind: 'subtipo',
      align: 'center',
      valign: 'top',
      font: { family: 'Georgia, serif', size: r2(8 * f), color: 'tinta', style: 'italic' },
      rect: { x: r2(m), y: r2(y + bandH * 0.6), w: r2(W - 2 * m), h: r2(bandH * 0.36) },
    });
  }
  return { zones };
}

/** Aplica el ajuste fino (colores, transparencia, bordes, tamaños de letra) por id de zona. */
export function applyFine(zones: Zone[], fine: FineTune | undefined, f: number): Zone[] {
  if (!fine) return zones;
  return zones.map((z) => {
    if (z.type === 'shape' && fine.pieces[z.id]) {
      const p = fine.pieces[z.id];
      const out = { ...z };
      if (p.fill) out.fill = p.fill === 'none' ? undefined : p.fill;
      if (p.opacity !== undefined) out.opacity = Math.min(1, Math.max(0, p.opacity));
      if (p.border === true) {
        out.stroke ??= 'acento';
        out.strokeWidth ??= Math.round(0.35 * f * 100) / 100;
      } else if (p.border === false) out.stroke = undefined;
      return out;
    }
    if (z.type === 'text' && fine.texts[z.id]) {
      const t = fine.texts[z.id];
      const scale = Math.min(1.5, Math.max(0.7, t.scale ?? 1));
      const r2 = (v: number) => Math.round(v * 100) / 100;
      return {
        ...z,
        minSize: z.minSize !== undefined ? r2(z.minSize * scale) : undefined,
        font: { ...z.font, size: r2(z.font.size * scale), ...(t.color ? { color: t.color } : {}) },
        ...(t.align ? { align: t.align } : {}),
      };
    }
    return z;
  });
}

/** De las respuestas del asistente a un proyecto completo que ya se puede ver y exportar. */
export function buildProject(answers: WizardAnswers): BuiltProject {
  const a = answers;
  const size = { width: a.size.width, height: a.size.height, safe: DEFAULT_SAFE_MM };
  const f = Math.min(size.width / 63, size.height / 88);
  const langs = a.langs.length ? a.langs : ['es'];
  const col = (name: string, lang: string) => textKey(name, lang, langs);
  const types = a.types.filter((t) => t.label.trim());
  const variantCol = normalizeKey(a.variant.column || 'rareza');
  const palette = a.adjust.palette;
  const files: Record<string, string> = {};

  const resolved = types.map((t) => resolvedType(a, t));
  const usesCost = resolved.some((r) => r.elements.has('cost'));
  const usesVariant = resolved.some((r) => r.elements.has('variant'));
  const any = (e: ElementKey) => resolved.some((r) => r.elements.has(e));

  // Catálogo de atributos con iconos provisionales.
  const attributes: Record<string, AttributeDef> = {};
  // Solo si alguna carta los muestra: los atributos de ejemplo no deben ensuciar el proyecto.
  if (any('stats')) a.attributes.forEach((at) => {
    const key = attrKey(at);
    if (!key || attributes[key]) return;
    const icon = `${PROVISIONAL_DIR}iconos/${fileKey(key)}.svg`;
    files[`assets/${icon}`] = iconSvg(shapeIndex(key), at.color, palette.tinta);
    attributes[key] = { icon, label: at.label.trim() };
  });
  if (usesCost && !attributes[COST_KEY]) {
    const icon = `${PROVISIONAL_DIR}iconos/coste.svg`;
    files[`assets/${icon}`] = costSvg(palette);
    attributes[COST_KEY] = { icon, label: 'Coste' };
  }

  const colors: Record<string, string> = { ...palette };
  if (usesVariant) for (const v of a.variant.values) if (v.name.trim()) colors[normalizeKey(v.name)] = v.color;

  // Plantillas e ilustraciones provisionales.
  const templates: Record<string, Template> = {};
  const backIds = new Map<string, string>();
  types.forEach((t, i) => {
    const key = typeKey(t);
    const r = resolved[i];
    const zones = applyFine(
      layoutZones({
        design: a.design,
        elements: r.elements,
        size,
        adjust: a.adjust,
        tipo: key,
        statKeys: r.attributes,
        variantColumn: variantCol,
      }),
      a.fine,
      f,
    );
    const art = zones.find((z) => z.id === 'ilustracion');
    if (art) files[`assets/${artPath(key)}`] = artSvg(art.rect.w, art.rect.h, palette, i * 47, `${t.label} · ilustración provisional`);
    const tpl: Template = { zones };
    if (a.backs !== 'none') {
      const backId = a.backs === 'common' ? 'TRASERA' : `TRASERA-${prefixes(types.map((x) => x.label))[i]}`;
      tpl.back = backId;
      backIds.set(key, backId);
    }
    templates[key] = tpl;
  });
  if (a.backs !== 'none') {
    templates[BACK_TEMPLATE] = backTemplate(a, f);
    files[`assets/${PROVISIONAL_DIR}trasera.svg`] = backSvg(palette, size.width, size.height);
  }

  const project: Project = {
    name: a.name.trim() || 'Mi juego',
    csv: 'cartas.csv',
    assetsDir: 'assets',
    card: size,
    fonts: [],
    attributes,
    templates,
    colors,
    export: { dpi: 300, format: 'png', quality: 95 },
  };

  // CSV con las columnas exactas y filas de ejemplo.
  const fields = ['id', 'tipo', ...langs.map((l) => col('titulo', l))];
  if (any('subtitle')) fields.push(...langs.map((l) => col('subtipo', l)));
  if (any('rules')) fields.push(...langs.map((l) => col('descripcion', l)));
  if (any('flavor')) fields.push(...langs.map((l) => col('sabor', l)));
  if (usesCost || any('stats')) fields.push('atributos');
  if (usesVariant) fields.push(variantCol);
  if (any('art')) fields.push('ilustracion');
  if (any('number')) fields.push('numero');
  fields.push('copias');
  if (a.backs === 'per-type') fields.push('color');

  const pre = prefixes(types.map((t) => t.label));
  const total = types.reduce((s, t) => s + Math.min(MAX_ROWS_PER_TYPE, Math.max(0, Math.round(t.count))), 0);
  const width = String(total).length < 3 ? 3 : String(total).length;
  const rows: Record<string, string>[] = [];
  let serial = 0;
  types.forEach((t, i) => {
    const r = resolved[i];
    const n = Math.min(MAX_ROWS_PER_TYPE, Math.max(0, Math.round(t.count)));
    const firstStat = r.attributes[0];
    for (let k = 1; k <= n; k++) {
      serial++;
      // Lo que el usuario escribió manda; lo vacío se rellena con ejemplos (y queda como pendiente).
      const data: CardData = t.cards?.[k - 1] ?? {};
      const own = (key: string) => (data[key] ?? '').trim();
      const row: Record<string, string> = { id: own('id') || `${pre[i]}-${String(k).padStart(3, '0')}`, tipo: t.label.trim() };
      for (const l of langs) {
        const ph = PLACEHOLDERS[l] ?? PLACEHOLDERS.es;
        row[col('titulo', l)] = own(col('titulo', l)) || `${t.label.trim()} ${k}`;
        if (r.elements.has('subtitle')) row[col('subtipo', l)] = own(col('subtipo', l)) || t.label.trim();
        if (r.elements.has('rules'))
          row[col('descripcion', l)] = own(col('descripcion', l)) || (firstStat && k === 1 ? `${ph.rules} {${firstStat}}` : ph.rules);
        if (r.elements.has('flavor')) row[col('sabor', l)] = own(col('sabor', l)) || ph.flavor;
      }
      const attrs: string[] = [];
      if (r.elements.has('cost')) attrs.push(`${COST_KEY}:${own('coste') || ((k - 1) % 5) + 1}`);
      if (r.elements.has('stats')) r.attributes.forEach((key, j) => attrs.push(`${key}:${own(`attr:${key}`) || ((k + j * 2) % 6) + 1}`));
      if (attrs.length) row.atributos = attrs.join(' | ');
      if (r.elements.has('variant') && a.variant.values.length)
        row[variantCol] = own('variante') || a.variant.values[(k - 1) % a.variant.values.length].name;
      if (r.elements.has('art') && own('ilustracion')) row.ilustracion = own('ilustracion');
      if (own('copias')) row.copias = own('copias');
      if (r.elements.has('number')) row.numero = `${String(serial).padStart(width, '0')}/${String(total).padStart(width, '0')}`;
      rows.push(row);
    }
  });
  if (a.backs === 'common') rows.push({ id: 'TRASERA', tipo: BACK_TEMPLATE, [col('titulo', langs[0])]: a.name.trim() });
  if (a.backs === 'per-type') {
    types.forEach((t, i) => {
      const row: Record<string, string> = { id: backIds.get(typeKey(t))!, tipo: BACK_TEMPLATE, color: shiftColor(palette.acento, i * 67, 0.28) };
      for (const l of langs) {
        row[col('titulo', l)] = a.name.trim();
        row[col('subtipo', l)] = t.label.trim();
      }
      rows.push(row);
    });
    for (const l of langs) if (!fields.includes(col('subtipo', l))) fields.push(col('subtipo', l));
  }

  const csv = Papa.unparse({ fields, data: rows.map((r) => fields.map((c) => r[c] ?? '')) }, { newline: '\n' }) + '\n';
  return { project, csv, files };
}
