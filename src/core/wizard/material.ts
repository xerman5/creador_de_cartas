import { parseAttributes } from '../attributes';
import { parseCsv } from '../csv';
import { capitalize, typeMatchKey } from '../naming';
import { normalizeKey } from '../text';
import { attrKey, relang, typeLabel, type AttrAnswer, type ElementKey, type TypeAnswer, type WizardAnswers } from './answers';
import { BACK_TEMPLATE } from './build';
import { ALIASES, importCsv, SILENT, typeFinder, VARIANT_NAMES, type ImportReport } from './table';

/** Idiomas que el asistente sabe elegir. */
export const LANG_CODES = ['es', 'en', 'fr', 'de', 'it', 'pt'];
const TEXT_BASES = ['titulo', 'subtipo', 'descripcion', 'sabor'];
const COLORS = ['#d9534f', '#4caf50', '#3d8fe0', '#f0b429', '#a45bd6', '#26a69a', '#ef7d3c', '#8d6e63'];
const VARIANT_COLORS = ['#9aa7b8', '#3d8fe0', '#a45bd6', '#f0b429', '#4caf50', '#d9534f', '#26a69a', '#ef7d3c'];
/** Columnas que el asistente ya entiende por sí mismas. */
const KNOWN = new Set([...SILENT, 'coste', 'atributos', 'ilustracion', 'encuadre', 'referencia', 'copias']);
const NUMBER = /^[+-]?\d+([.,]\d+)?$/;
const YES = /^(x|si|sí|yes|y|true|✓|✔|\*)$/i;
const NO = /^(no|-|—)$/i;

export interface Deduction {
  answers: WizardAnswers;
  /** Lo que se ha deducido, para contárselo al usuario: «Tipos nuevos: …», «Idiomas: …». */
  notes: string[];
  report: ImportReport;
}

const header = (h: string) => {
  const m = /^(.*?)(?:-([a-z]{2}))?$/.exec(h)!;
  return { base: ALIASES[m[1]] ?? m[1], lang: m[2] };
};

/** El tipo que dice una fila del CSV: su clase y su subclase, o solo el tipo. */
function typeOfRow(row: Record<string, string>): { clase?: string; label: string } | null {
  const tipo = (row.tipo ?? '').trim();
  const clase = (row.clase ?? '').trim();
  const sub = (row.subclase ?? '').trim();
  if (clase) {
    // «tipo» puede traer la combinación («Elfo Ataque»): la subclase es lo que queda sin la clase.
    const rest = sub || (normalizeKey(tipo).startsWith(normalizeKey(clase) + ' ') ? tipo.slice(clase.length).trim() : tipo);
    return rest ? { clase, label: rest } : null;
  }
  return tipo ? { label: tipo } : null;
}

/**
 * Una hoja de cálculo como material: además de sus cartas, dice qué tiene el juego. Crea los tipos que no
 * existen (con su clase si la trae), añade los idiomas de sus columnas («titulo-en»), los atributos (una
 * columna de números) y las habilidades (una columna de «x»), la rareza o facción con sus valores, y marca en
 * cada tipo los elementos que usan sus cartas (reglas, ambientación, coste…). Nunca quita nada.
 */
export function deduceFromCsv(a: WizardAnswers, text: string, fallbackType = 0): Deduction {
  const csv = parseCsv(text);
  const next: WizardAnswers = JSON.parse(JSON.stringify(a));
  const notes: string[] = [];
  const rows = csv.rows.filter((r) => normalizeKey(r.tipo ?? '') !== BACK_TEMPLATE);
  const filled = (col: string) => rows.filter((r) => (r[col] ?? '').trim());

  // Idiomas: los de las columnas de texto con sufijo.
  const found = new Set<string>();
  let plain = false;
  for (const h of csv.columns) {
    const { base, lang } = header(h);
    if (!TEXT_BASES.includes(base) || !filled(h).length) continue;
    if (lang && LANG_CODES.includes(lang)) found.add(lang);
    else if (!lang) plain = true;
  }
  if (found.size) {
    const untouched = a.langs.length === 1 && !plain && !found.has(a.langs[0]);
    const langs = untouched ? [...found] : [...new Set([...a.langs, ...found])];
    if (langs.join() !== a.langs.join()) {
      next.types = relang(next.types, a.langs, langs);
      next.langs = langs;
      notes.push(`Idiomas: ${langs.join(', ')}`);
    }
  }

  // Tipos que no existen: se crean. El de partida, si sigue sin nombre ni cartas, deja su sitio.
  const find = typeFinder(next.types);
  const fresh = new Map<string, { clase?: string; label: string; count: number }>();
  for (const r of rows) {
    const t = typeOfRow(r);
    if (!t || find(r) !== undefined) continue;
    const key = typeMatchKey(t.clase, t.label);
    const g = fresh.get(key) ?? { ...t, count: 0 };
    g.count++;
    fresh.set(key, g);
  }
  if (fresh.size) {
    const blank = next.types.length === 1 && !next.types[0].label.trim() && !next.types[0].cards?.length;
    const model = next.types.find((t) => t.label.trim() && !t.sameAs);
    const created: TypeAnswer[] = [...fresh.values()].map((t) => ({
      ...(t.clase ? { clase: capitalize(t.clase) } : {}),
      label: capitalize(t.label),
      count: t.count,
      elements: model ? [...model.elements] : ['art', 'number'],
      attributes: model ? [...model.attributes] : [],
    }));
    next.types = blank ? created : [...next.types, ...created];
    notes.push(`Tipos nuevos: ${created.map((t) => `${typeLabel(t)} (${t.count})`).join(', ')}`);
  }

  // Atributos, habilidades y rareza: columnas que no son de nada conocido.
  const attrKeys = new Set(next.attributes.map(attrKey));
  const variantCol = normalizeKey(next.variant.column || 'rareza');
  const newAttrs: AttrAnswer[] = [];
  const addAttr = (key: string, kind: 'number' | 'icon') => {
    if (!key || key === 'coste' || attrKeys.has(key)) return;
    attrKeys.add(key);
    newAttrs.push({ label: capitalize(key), color: COLORS[(next.attributes.length + newAttrs.length) % COLORS.length], ...(kind === 'icon' ? { kind } : {}) });
  };
  let variantFrom = '';
  for (const h of csv.columns) {
    const { base } = header(h);
    if (KNOWN.has(h) || TEXT_BASES.includes(base) || attrKeys.has(h)) continue;
    const values = filled(h).map((r) => r[h].trim());
    if (!values.length) continue;
    if (h === variantCol || VARIANT_NAMES.includes(h)) {
      variantFrom = h;
      continue;
    }
    if (values.every((v) => YES.test(v) || NO.test(v)) && values.some((v) => YES.test(v))) addAttr(h, 'icon');
    else if (values.every((v) => NUMBER.test(v))) addAttr(h, 'number');
  }
  for (const r of filled('atributos'))
    for (const it of parseAttributes(r.atributos)) addAttr(it.key, it.value && !YES.test(it.value) ? 'number' : 'icon');
  if (newAttrs.length) {
    next.attributes.push(...newAttrs);
    const kinds = (icon: boolean) => newAttrs.filter((x) => (x.kind === 'icon') === icon).map((x) => x.label);
    if (kinds(false).length) notes.push(`Atributos: ${kinds(false).join(', ')}`);
    if (kinds(true).length) notes.push(`Habilidades: ${kinds(true).join(', ')}`);
  }
  if (variantFrom) {
    const values = [...new Set(filled(variantFrom).map((r) => r[variantFrom].trim()))].slice(0, 12);
    const same = normalizeKey(next.variant.column) === variantFrom;
    const known = same ? next.variant.values.filter((v) => values.some((x) => normalizeKey(x) === normalizeKey(v.name))) : [];
    const added = values.filter((x) => !known.some((v) => normalizeKey(v.name) === normalizeKey(x)));
    // Otra columna (Facción en vez de Rareza) o valores que no son los de ejemplo: mandan los del CSV.
    next.variant = {
      column: same ? next.variant.column : capitalize(variantFrom),
      values: [
        ...(same && !added.length ? next.variant.values : known),
        ...added.map((name, i) => ({ name, color: VARIANT_COLORS[(known.length + i) % VARIANT_COLORS.length] })),
      ],
    };
    if (!same || added.length) notes.push(`${next.variant.column}: ${next.variant.values.map((v) => v.name).join(', ')}`);
  }

  // Elementos de cada tipo: los que usan sus cartas (solo se añaden).
  const findNow = typeFinder(next.types);
  const allAttrs = new Set(next.attributes.map(attrKey));
  const variantNow = normalizeKey(next.variant.column || 'rareza');
  next.types.forEach((t, i) => {
    const mine = rows.filter((r) => (r.tipo?.trim() || r.clase?.trim() ? findNow(r) : fallbackType) === i);
    if (!mine.length) return;
    const has = (col: string) => mine.some((r) => (r[col] ?? '').trim());
    const add = (e: ElementKey) => !t.elements.includes(e) && t.elements.push(e);
    for (const h of csv.columns) {
      if (!has(h)) continue;
      const { base } = header(h);
      if (base === 'subtipo') add('subtitle');
      else if (base === 'descripcion') add('rules');
      else if (base === 'sabor') add('flavor');
      else if (h === 'coste') add('cost');
      else if (h === variantNow || VARIANT_NAMES.includes(h)) add('variant');
      else if (base === 'ilustracion') add('art');
    }
    const used = new Set<string>();
    for (const h of csv.columns) if (allAttrs.has(h) && has(h)) used.add(h);
    for (const r of mine) for (const it of parseAttributes(r.atributos ?? '')) if (allAttrs.has(it.key)) used.add(it.key);
    if (used.size) {
      add('stats');
      t.attributes = [...new Set([...t.attributes, ...used])];
    }
  });

  const { types, report } = importCsv(next, text, fallbackType);
  return { answers: { ...next, types }, notes, report };
}
