import { MemorySource } from '../../core/assets';
import { loadProject, type LoadedProject } from '../../core/project';
import { normalizeKey } from '../../core/text';
import type { CardRow } from '../../core/types';
import { withDefaults, type DesignId, type WizardAnswers } from '../../core/wizard/answers';
import { BACK_TEMPLATE, buildProject, projectFiles } from '../../core/wizard/build';
import { IMAGES_DIR } from '../../core/wizard/images';
import { decodeResources, encodeResources, resourceFiles, type Resources } from '../../core/wizard/resources';

export interface PreviewOptions {
  design?: DesignId;
  /** Carta concreta que se quiere ver (índices de tipo y de carta). */
  focus?: { type: number; card: number };
  /** Imágenes elegidas: ruta dentro de la carpeta → archivo. */
  images?: Map<string, Blob>;
  /** Iconos y fondos subidos. */
  resources?: Resources;
}

/** Archivos de las imágenes elegidas, en assets/ilustraciones/. */
export function imageFiles(images: Map<string, Blob> | undefined): Record<string, Blob> {
  return Object.fromEntries([...(images ?? [])].map(([path, blob]) => [`assets/${IMAGES_DIR}/${path}`, blob]));
}

/** Proyecto en memoria para la vista previa: pocas filas por tipo, que es lo que se dibuja. */
export async function previewProject(answers: WizardAnswers, o: PreviewOptions = {}): Promise<LoadedProject> {
  const a: WizardAnswers = {
    ...answers,
    design: o.design ?? answers.design,
    types: answers.types.map((t, i) => {
      // Para ver la carta N hacen falta sus N-1 anteriores (numeración y textos de ejemplo).
      const upTo = o.focus?.type === i ? o.focus.card + 1 : 2;
      return { ...t, label: previewLabel(t.label), count: Math.max(1, Math.min(t.count, upTo)), cards: t.cards?.slice(0, upTo) };
    }),
  };
  const files = { ...projectFiles(buildProject(a)), ...resourceFiles(o.resources), ...imageFiles(o.images) };
  return loadProject(new MemorySource('vista previa', files));
}

/** Un tipo aún sin nombre se enseña como «Carta» en la vista previa. */
export const previewLabel = (label: string | undefined) => label?.trim() || 'Carta';

export function rowOfType(lp: LoadedProject | null, label: string, index = 0): CardRow | undefined {
  const key = normalizeKey(previewLabel(label));
  const rows = lp?.rows.filter((r) => normalizeKey(r.tipo ?? '') === key) ?? [];
  return rows[Math.min(index, rows.length - 1)];
}

export function backRow(lp: LoadedProject | null, label?: string): CardRow | undefined {
  const backs = lp?.rows.filter((r) => normalizeKey(r.tipo ?? '') === BACK_TEMPLATE) ?? [];
  return (label && backs.find((r) => normalizeKey(r.subtipo ?? r['subtipo-es'] ?? '') === normalizeKey(label))) || backs[0];
}

const DRAFT_KEY = 'creador-de-cartas/asistente';
export const PROGRESS_FORMAT = 'creador-de-cartas/asistente';

export interface Progress {
  answers: WizardAnswers;
  /** Id del paso (los números cambian al añadir pasos). */
  step: string | number;
  /** Iconos y fondos subidos (desde la versión 2 del archivo). */
  resources?: Resources;
}

/** El borrador vive solo en este navegador; si el almacenamiento falla, se trabaja sin él. */
export function loadDraft(): Progress | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { answers: withDefaults(data.answers), step: data.step ?? 0 };
  } catch {
    return null;
  }
}

export function saveDraft(answers: WizardAnswers, step: string) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step }));
  } catch {
    // sin almacenamiento (o lleno): el borrador no se conserva; queda el archivo de progreso
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nada que borrar
  }
}

// Los archivos subidos no caben en localStorage: van a IndexedDB, también solo en este navegador.
const DB = 'creador-de-cartas';
const STORE = 'asistente-recursos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDraftResources(): Promise<Resources> {
  try {
    const db = await openDb();
    return await new Promise<Resources>((resolve, reject) => {
      const out: Resources = new Map();
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        if (cur.value instanceof Blob) out.set(String(cur.key), cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return new Map();
  }
}

/** Sustituye los recursos guardados por estos. */
export async function saveDraftResources(res: Resources): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const [path, blob] of res) store.put(blob, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }).finally(() => db.close());
  } catch {
    // sin IndexedDB: los recursos viven hasta cerrar la pestaña; queda el archivo de progreso
  }
}

/** Archivo de progreso para seguir otro día o en otro ordenador; lleva dentro los iconos y fondos. */
export async function progressJson(answers: WizardAnswers, step: string, resources: Resources = new Map()): Promise<string> {
  const data = { format: PROGRESS_FORMAT, version: 2, savedAt: new Date().toISOString(), step, answers, resources: await encodeResources(resources) };
  return JSON.stringify(data, null, 2) + '\n';
}

export function parseProgress(text: string): Progress {
  let data: { format?: string; step?: string | number; answers?: Partial<WizardAnswers>; resources?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un progreso del asistente (JSON no válido).');
  }
  if (data?.format !== PROGRESS_FORMAT) throw new Error('El archivo no es un progreso del asistente.');
  return { answers: withDefaults(data.answers), step: data.step ?? 0, resources: decodeResources(data.resources) };
}
