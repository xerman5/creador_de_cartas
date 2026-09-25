import Papa from 'papaparse';
import { parseCsv } from '../csv';
import type { LoadedProject } from '../project';
import { normalizeKey } from '../text';
import type { Project } from '../types';
import { attrKey, withDefaults, type WizardAnswers } from './answers';
import { BACK_TEMPLATE, PROVISIONAL_DIR, type BuiltProject } from './build';
import { importCsv } from './table';

/**
 * El asistente dentro de un proyecto: `asistente.json` guarda las respuestas y las huellas de lo
 * que el asistente escribió la última vez. Al volver, lo que se cambió después en el editor o en
 * Excel (su huella ya no coincide) manda sobre las respuestas; al aplicar, lo retocado a mano no se
 * pisa sin preguntar y lo que el asistente no conoce (columnas, tipos, plantillas) se conserva.
 */
export const WIZARD_FILE = 'asistente.json';
export const PROGRESS_FORMAT = 'creador-de-cartas/asistente';

/** Huellas de lo que escribió el asistente. */
export interface Generated {
  /** Plantilla → huella. Son las plantillas del asistente. */
  templates: Record<string, string>;
  csv: string;
  colors: string;
  /** Atributo → ruta de su icono. */
  icons: Record<string, string>;
  card: { width: number; height: number };
  name: string;
}

export interface WizardFile {
  answers: WizardAnswers;
  step: string | number;
  generated?: Generated;
}

/** JSON con las claves ordenadas y sin `undefined`: el mismo objeto da siempre el mismo texto. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a de 32 bits: suficiente para saber si algo ha cambiado. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const hashOf = (v: unknown) => hash(stableStringify(v));
/** Los saltos de línea dependen de quién guardó el archivo. */
const csvHash = (text: string) => hash(text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trimEnd());

/** Huellas de un proyecto recién generado (con el CSV tal como se escribe). */
export function fingerprint(project: Project, csv: string): Generated {
  return {
    templates: Object.fromEntries(Object.entries(project.templates).map(([k, t]) => [k, hashOf(t)])),
    csv: csvHash(csv),
    colors: hashOf(project.colors ?? {}),
    icons: Object.fromEntries(Object.entries(project.attributes).map(([k, d]) => [k, d.icon])),
    card: { width: project.card.width, height: project.card.height },
    name: project.name,
  };
}

export function wizardFileJson(f: WizardFile): string {
  return JSON.stringify({ format: PROGRESS_FORMAT, version: 2, savedAt: new Date().toISOString(), ...f }, null, 2) + '\n';
}

export function parseWizardFile(text: string): WizardFile {
  let data: { format?: string; step?: string | number; answers?: Partial<WizardAnswers>; generated?: Generated };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`«${WIZARD_FILE}» no es JSON válido.`);
  }
  if (data?.format !== PROGRESS_FORMAT) throw new Error(`«${WIZARD_FILE}» no es un archivo del asistente.`);
  return { answers: withDefaults(data.answers), step: data.step ?? 0, generated: data.generated };
}

// ------------------------------------------------------------ retomar

/**
 * Respuestas para retomar el asistente en un proyecto: las guardadas, más lo que se cambió
 * fuera del asistente desde la última vez. `notes` dice qué se ha traído.
 */
export function resumeAnswers(file: WizardFile, project: Project, csvText: string): { answers: WizardAnswers; notes: string[] } {
  const a = withDefaults(structuredClone(file.answers));
  const g = file.generated;
  const notes: string[] = [];

  if (!g || project.name !== g.name) a.name = project.name;
  if (!g || project.card.width !== g.card.width || project.card.height !== g.card.height) {
    if (a.size.width !== project.card.width || a.size.height !== project.card.height) notes.push('el tamaño de carta');
    a.size = { width: project.card.width, height: project.card.height };
  }

  // Iconos cambiados en Proyecto › Atributos.
  const changedIcons: string[] = [];
  const iconOf = (key: string) => project.attributes[key]?.icon;
  const own = (path: string | undefined) => (path && !path.replace(/\\/g, '/').startsWith(PROVISIONAL_DIR) ? path : undefined);
  for (const at of a.attributes) {
    const key = attrKey(at);
    const cur = iconOf(key);
    if (cur !== undefined && cur !== g?.icons[key] && own(cur) !== at.icon) {
      at.icon = own(cur);
      changedIcons.push(at.label);
    }
  }
  const cost = iconOf('coste');
  if (cost !== undefined && cost !== g?.icons.coste && own(cost) !== a.costIcon) {
    a.costIcon = own(cost);
    changedIcons.push('Coste');
  }
  if (changedIcons.length) notes.push(`los iconos de ${changedIcons.join(', ')}`);

  // Colores cambiados en Proyecto › Colores: la paleta y los de la rareza.
  const colors = project.colors ?? {};
  if (g && hashOf(colors) !== g.colors) {
    for (const k of ['principal', 'acento', 'papel', 'tinta'] as const) if (colors[k]) a.adjust.palette[k] = colors[k];
    for (const v of a.variant.values) {
      const c = colors[normalizeKey(v.name)];
      if (c) v.color = c;
    }
    notes.push('los colores');
  }

  // La tabla editada fuera (Excel, el editor): manda el CSV.
  if (!g || csvHash(csvText) !== g.csv) {
    const { types } = importCsv(a, csvText);
    a.types = types;
    notes.push('las cartas del CSV');
  }
  return { answers: a, notes };
}

// ------------------------------------------------------------ aplicar

/** Plantillas del asistente que se han retocado a mano (o que ya existían sin ser suyas). */
export function handEdited(current: Project, built: Project, g: Generated | undefined): string[] {
  return Object.keys(built.templates).filter((k) => {
    const tpl = current.templates[k];
    if (!tpl) return false;
    const was = g?.templates[k];
    return !was || hashOf(tpl) !== was;
  });
}

/**
 * El proyecto que resulta de aplicar el asistente sobre el actual. `keep` son las plantillas
 * retocadas a mano que se conservan tal cual.
 */
export function applyProject(current: Project, built: Project, g: Generated | undefined, keep: Set<string>): Project {
  const templates = { ...current.templates };
  const edited = new Set(handEdited(current, built, g));
  for (const [k, tpl] of Object.entries(built.templates)) if (!(edited.has(k) && keep.has(k))) templates[k] = tpl;
  // Tipos que el asistente ya no tiene: su plantilla se va, salvo que se hubiera retocado.
  for (const [k, h] of Object.entries(g?.templates ?? {}))
    if (!built.templates[k] && templates[k] && hashOf(templates[k]) === h) delete templates[k];

  const attributes = { ...current.attributes };
  for (const k of Object.keys(g?.icons ?? {})) if (!built.attributes[k]) delete attributes[k];
  Object.assign(attributes, built.attributes);

  return {
    ...current,
    name: built.name,
    card: { ...current.card, width: built.card.width, height: built.card.height },
    attributes,
    templates,
    colors: { ...current.colors, ...built.colors },
    // Las fuentes del asistente, más las que se añadieron a mano.
    fonts: [...current.fonts.filter((f) => !built.fonts.some((b) => b.family === f.family)), ...built.fonts],
  };
}

/**
 * CSV nuevo a partir del del asistente, conservando del actual lo que el asistente no conoce:
 * columnas propias (por `id`) y filas de tipos que no son suyos.
 */
export function mergeCsv(builtCsv: string, currentCsv: string, wizardTypes: string[]): string {
  const built = parseCsv(builtCsv);
  const cur = parseCsv(currentCsv);
  const own = new Set([...wizardTypes.map(normalizeKey), BACK_TEMPLATE]);
  const extra = cur.columns.filter((c) => !built.columns.includes(c));
  const byId = new Map(cur.rows.filter((r) => r.id?.trim()).map((r) => [r.id.trim(), r]));
  const fields = [...built.columns, ...extra];
  const rows = built.rows.map((r) => {
    const old = byId.get(r.id?.trim() ?? '');
    return fields.map((c) => r[c] ?? old?.[c] ?? '');
  });
  for (const r of cur.rows) if (!own.has(normalizeKey(r.tipo ?? ''))) rows.push(fields.map((c) => r[c] ?? ''));
  return Papa.unparse({ fields, data: rows }, { newline: '\n' }) + '\n';
}

/** Todo lo que se escribe al aplicar: proyecto, CSV y el propio asistente.json. */
export function applyAll(
  lp: Pick<LoadedProject, 'project'>,
  currentCsv: string,
  built: BuiltProject,
  answers: WizardAnswers,
  step: string,
  g: Generated | undefined,
  keep: Set<string>,
): { project: Project; csv: string; wizard: string } {
  const project = applyProject(lp.project, built.project, g, keep);
  const csv = mergeCsv(built.csv, currentCsv, answers.types.map((t) => t.label));
  // Las huellas son las de lo generado: lo que se conservó a mano seguirá contando como retocado.
  const generated = fingerprint({ ...project, templates: built.project.templates, attributes: built.project.attributes }, csv);
  return { project, csv, wizard: wizardFileJson({ answers, step, generated }) };
}

/** Para un proyecto nuevo: el `asistente.json` que lo acompaña. */
export function newWizardFile(built: BuiltProject, answers: WizardAnswers, step: string): string {
  return wizardFileJson({ answers, step, generated: fingerprint(built.project, built.csv) });
}
