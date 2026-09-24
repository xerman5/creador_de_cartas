import { MemorySource } from '../../core/assets';
import { loadProject, type LoadedProject } from '../../core/project';
import { normalizeKey } from '../../core/text';
import type { CardRow } from '../../core/types';
import type { DesignId, WizardAnswers } from '../../core/wizard/answers';
import { BACK_TEMPLATE, buildProject, projectFiles } from '../../core/wizard/build';

/** Proyecto en memoria para la vista previa: pocas filas por tipo, que es lo que se dibuja. */
export async function previewProject(answers: WizardAnswers, design?: DesignId): Promise<LoadedProject> {
  const a: WizardAnswers = {
    ...answers,
    design: design ?? answers.design,
    types: answers.types.map((t) => ({ ...t, label: previewLabel(t.label), count: 2 })),
  };
  return loadProject(new MemorySource('vista previa', projectFiles(buildProject(a))));
}

/** Un tipo aún sin nombre se enseña como «Carta» en la vista previa. */
export const previewLabel = (label: string | undefined) => label?.trim() || 'Carta';

export function rowOfType(lp: LoadedProject | null, label: string): CardRow | undefined {
  const key = normalizeKey(previewLabel(label));
  return lp?.rows.find((r) => normalizeKey(r.tipo ?? '') === key);
}

export function backRow(lp: LoadedProject | null, label?: string): CardRow | undefined {
  const backs = lp?.rows.filter((r) => normalizeKey(r.tipo ?? '') === BACK_TEMPLATE) ?? [];
  return (label && backs.find((r) => normalizeKey(r.subtipo ?? r['subtipo-es'] ?? '') === normalizeKey(label))) || backs[0];
}

const DRAFT_KEY = 'creador-de-cartas/asistente';

/** El borrador vive solo en este navegador; si el almacenamiento falla, se trabaja sin él. */
export function loadDraft(): { answers: WizardAnswers; step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(answers: WizardAnswers, step: number) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step }));
  } catch {
    // sin almacenamiento: el borrador no se conserva
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nada que borrar
  }
}
