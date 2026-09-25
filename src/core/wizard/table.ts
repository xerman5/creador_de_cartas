import Papa from 'papaparse';
import { parseAttributes } from '../attributes';
import { parseCsv } from '../csv';
import { normalizeKey } from '../text';
import { typeMatchKey } from '../naming';
import { attrKey, flagOn, fullName, isAbility, resolvedType, textKey, typeKey, typeLabel, type CardData, type TypeAnswer, type WizardAnswers } from './answers';
import { BACK_TEMPLATE, cardIds, PLACEHOLDERS } from './build';

export interface TableColumn {
  /** Clave en `CardData`. */
  key: string;
  /** Cabecera en el CSV para rellenar. */
  header: string;
  label: string;
  /** `flag`: habilidad, la carta la tiene («x») o no (vacío). */
  kind: 'id' | 'text' | 'long' | 'number' | 'flag' | 'variant' | 'image' | 'crop';
}

const TEXT_FIELDS = [
  { field: 'titulo', label: 'Título', element: null, kind: 'text' },
  { field: 'subtipo', label: 'Línea de tipo', element: 'subtitle', kind: 'text' },
  { field: 'descripcion', label: 'Reglas', element: 'rules', kind: 'long' },
  { field: 'sabor', label: 'Ambientación', element: 'flavor', kind: 'long' },
] as const;

/** Columnas que se rellenan para un tipo (o para todos), en orden; `lang` limita los textos a un idioma. */
export function tableColumns(a: WizardAnswers, types: TypeAnswer[], lang?: string): TableColumn[] {
  const langs = a.langs.length ? a.langs : ['es'];
  const res = types.map((t) => resolvedType(a, t));
  const has = (e: string) => res.some((r) => r.declared.has(e as never));
  const suffix = (l: string) => (langs.length > 1 ? ` (${l})` : '');
  const cols: TableColumn[] = [{ key: 'id', header: 'id', label: 'Id', kind: 'id' }];
  for (const tf of TEXT_FIELDS) {
    if (tf.element && !has(tf.element)) continue;
    for (const l of lang ? [lang] : langs) {
      const key = textKey(tf.field, l, langs);
      cols.push({ key, header: key, label: tf.label + (lang ? '' : suffix(l)), kind: tf.kind });
    }
  }
  if (has('cost')) cols.push({ key: 'coste', header: 'coste', label: 'Coste', kind: 'number' });
  if (has('stats')) {
    const used = new Set(res.flatMap((r) => r.attributes));
    for (const at of a.attributes) {
      const k = attrKey(at);
      if (used.has(k)) cols.push({ key: `attr:${k}`, header: k, label: at.label, kind: isAbility(at) ? 'flag' : 'number' });
    }
  }
  if (has('variant')) cols.push({ key: 'variante', header: normalizeKey(a.variant.column || 'rareza'), label: a.variant.column || 'Rareza', kind: 'variant' });
  if (has('art')) {
    cols.push({ key: 'ilustracion', header: 'ilustracion', label: 'Ilustración', kind: 'image' });
    // El encuadre se ajusta arrastrando la imagen, no escribiendo: va en el CSV pero no en la tabla.
    cols.push({ key: 'encuadre', header: 'encuadre', label: 'Encuadre', kind: 'crop' });
  }
  // La referencia (un boceto que se ve al lado de la carta) solo aparece si alguna carta la tiene.
  if (types.some((t) => t.cards?.some((c) => c.referencia?.trim())))
    cols.push({ key: 'referencia', header: 'referencia', label: 'Referencia', kind: 'image' });
  cols.push({ key: 'copias', header: 'copias', label: 'Copias', kind: 'number' });
  return cols;
}

/**
 * CSV para rellenar en una hoja de cálculo: una fila por carta, una columna por atributo y
 * «;» como separador (Excel en español). Con BOM para que se lea como UTF-8.
 */
export function fillCsv(a: WizardAnswers): string {
  const types = a.types.filter((t) => t.label.trim());
  const cols = tableColumns(a, types);
  const ids = cardIds(types);
  const withClases = types.some((t) => t.clase?.trim());
  const rows: string[][] = [];
  types.forEach((t, i) => {
    for (let k = 0; k < t.count; k++) {
      const data = t.cards?.[k] ?? {};
      // La primera columna es siempre «id»; «tipo» va justo detrás.
      const value = (c: TableColumn) => (c.kind === 'flag' ? (flagOn(data[c.key]) ? 'x' : '') : (data[c.key] ?? ''));
      const clase = withClases ? [t.clase?.trim() ?? '', t.label.trim()] : [];
      rows.push([data.id?.trim() || ids[i](k + 1), fullName(t), ...clase, ...cols.slice(1).map(value)]);
    }
  });
  const fields = ['id', 'tipo', ...(withClases ? ['clase', 'subclase'] : []), ...cols.slice(1).map((c) => c.header)];
  return '﻿' + Papa.unparse({ fields, data: rows }, { delimiter: ';', newline: '\r\n' }) + '\r\n';
}

export interface ImportReport {
  /** Cartas importadas por tipo (etiqueta). */
  byType: Record<string, number>;
  /** Valores de «tipo» que no corresponden a ningún tipo del asistente. */
  unknownTypes: string[];
  /** Columnas que no se han podido usar. */
  ignored: string[];
}

const ALIASES: Record<string, string> = { nombre: 'titulo', texto: 'descripcion', reglas: 'descripcion', ambientacion: 'sabor', imagen: 'ilustracion' };
const SILENT = new Set(['numero', 'trasera', 'color', 'tipo', 'id', 'clase', 'subclase']);
const VARIANT_NAMES = ['rareza', 'faccion', 'clan', 'elemento'];
/** Textos de relleno del asistente (las reglas de ejemplo pueden llevar un icono detrás). */
const isPlaceholder = (v: string) => Object.values(PLACEHOLDERS).some((p) => v === p.flavor || v.startsWith(p.rules));

/**
 * Lee un CSV (el de rellenar, el del proyecto o uno propio) y reparte sus filas por tipo.
 * Los tipos que aparecen en el CSV sustituyen sus cartas; los demás no se tocan.
 */
export function importCsv(a: WizardAnswers, text: string, fallbackType = 0): { types: TypeAnswer[]; report: ImportReport } {
  const langs = a.langs.length ? a.langs : ['es'];
  const csv = parseCsv(text);
  const variantCol = normalizeKey(a.variant.column || 'rareza');
  const attrKeys = new Set(a.attributes.map(attrKey).filter(Boolean));
  const abilities = new Set(a.attributes.filter(isAbility).map(attrKey));
  /** Las habilidades se guardan como «x»; los atributos con número, con su valor. */
  const setAttr = (d: CardData, key: string, v: string) => {
    if (!abilities.has(key)) d[`attr:${key}`] = v;
    else if (flagOn(v)) d[`attr:${key}`] = 'x';
  };
  const report: ImportReport = { byType: {}, unknownTypes: [], ignored: [] };

  // Qué hace cada columna del CSV.
  const mapping = new Map<string, (data: CardData, value: string) => void>();
  for (const header of csv.columns) {
    const m = /^(.*?)(?:-([a-z]{2}))?$/.exec(header)!;
    const base = ALIASES[m[1]] ?? m[1];
    const lang = m[2];
    if (['titulo', 'subtipo', 'descripcion', 'sabor'].includes(base)) {
      const target = lang && langs.includes(lang) ? lang : !lang ? langs[0] : null;
      if (target) mapping.set(header, (d, v) => (d[textKey(base, target, langs)] = v));
      else report.ignored.push(header);
    } else if (header === 'atributos') {
      mapping.set(header, (d, v) => {
        for (const it of parseAttributes(v)) {
          if (it.key === 'coste') d.coste = it.value;
          else setAttr(d, it.key, abilities.has(it.key) ? 'x' : it.value);
        }
      });
    } else if (header === 'coste') mapping.set(header, (d, v) => (d.coste = v));
    else if (attrKeys.has(header)) mapping.set(header, (d, v) => setAttr(d, header, v));
    else if (header === variantCol || VARIANT_NAMES.includes(header)) mapping.set(header, (d, v) => (d.variante = v));
    else if (base === 'ilustracion') mapping.set(header, (d, v) => (d.ilustracion = v));
    else if (header === 'encuadre') mapping.set(header, (d, v) => (d.encuadre = v));
    else if (header === 'referencia') mapping.set(header, (d, v) => (d.referencia = v));
    else if (header === 'copias') mapping.set(header, (d, v) => (d.copias = v));
    else if (!SILENT.has(header)) report.ignored.push(header);
  }

  const byKey = new Map(a.types.map((t, i) => [typeKey(t), i]));
  // Sin coincidencia exacta, se admite el tipo escrito en plural o con otros separadores («Elfos-Ataques»).
  const byMatch = new Map(a.types.map((t, i) => [typeMatchKey(t.clase, t.label), i]));
  const find = (row: Record<string, string>): number | undefined => {
    const tipo = (row.tipo ?? '').trim();
    const withClase = row.clase?.trim() ? `${row.clase.trim()} ${row.subclase?.trim() || tipo}` : '';
    for (const name of [tipo, withClase].filter(Boolean)) {
      const i = byKey.get(normalizeKey(name)) ?? byMatch.get(typeMatchKey(name));
      if (i !== undefined) return i;
    }
    return undefined;
  };
  const incoming = new Map<number, CardData[]>();
  const unknown = new Set<string>();
  for (const row of csv.rows) {
    const tipo = (row.tipo ?? '').trim();
    if (normalizeKey(tipo) === BACK_TEMPLATE) continue;
    const index = tipo || row.clase?.trim() ? find(row) : fallbackType;
    if (index === undefined) {
      unknown.add(tipo || `${row.clase ?? ''} ${row.subclase ?? ''}`.trim());
      continue;
    }
    const data: CardData = {};
    if (row.id?.trim()) data.id = row.id.trim();
    for (const [header, apply] of mapping) {
      const v = (row[header] ?? '').trim();
      if (v && !isPlaceholder(v)) apply(data, v);
    }
    // Lo que el asistente pone de relleno («Elfo Ataque 3», el nombre del tipo como línea de tipo) no es un dato.
    const t = a.types[index];
    const numbered = new RegExp(`^${fullName(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`);
    for (const l of langs) {
      if (numbered.test(data[textKey('titulo', l, langs)] ?? '')) delete data[textKey('titulo', l, langs)];
      const sub = data[textKey('subtipo', l, langs)];
      if (sub === typeLabel(t) || sub === t.label.trim()) delete data[textKey('subtipo', l, langs)];
    }
    incoming.set(index, [...(incoming.get(index) ?? []), data]);
  }

  const types = a.types.map((t, i) => {
    const cards = incoming.get(i);
    if (!cards) return t;
    report.byType[typeLabel(t)] = cards.length;
    return { ...t, cards, count: cards.length };
  });
  report.unknownTypes = [...unknown];
  return { types, report };
}
