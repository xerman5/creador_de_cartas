import { MemorySource } from '../../core/assets';
import { loadProject, type LoadedProject } from '../../core/project';
import { normalizeKey } from '../../core/text';
import type { CardRow } from '../../core/types';
import { withDefaults, type DesignId, type WizardAnswers } from '../../core/wizard/answers';
import { BACK_TEMPLATE, buildProject, projectFiles } from '../../core/wizard/build';
import { IMAGES_DIR } from '../../core/wizard/images';

export interface PreviewOptions {
  design?: DesignId;
  /** Carta concreta que se quiere ver (índices de tipo y de carta). */
  focus?: { type: number; card: number };
  /** Imágenes elegidas: ruta dentro de la carpeta → archivo. */
  images?: Map<string, Blob>;
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
  const files = { ...projectFiles(buildProject(a)), ...imageFiles(o.images) };
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

/** Archivo de progreso para seguir otro día o en otro ordenador. */
export function progressJson(answers: WizardAnswers, step: string): string {
  return JSON.stringify({ format: PROGRESS_FORMAT, version: 1, savedAt: new Date().toISOString(), step, answers }, null, 2) + '\n';
}

export function parseProgress(text: string): Progress {
  let data: { format?: string; step?: string | number; answers?: Partial<WizardAnswers> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un progreso del asistente (JSON no válido).');
  }
  if (data?.format !== PROGRESS_FORMAT) throw new Error('El archivo no es un progreso del asistente.');
  return { answers: withDefaults(data.answers), step: data.step ?? 0 };
}
