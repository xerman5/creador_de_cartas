import JSZip from 'jszip';
import { BLEED_MM, cardPixels, cardSizeFor, type CardPixels } from './card';
import type { ExportPlan } from './deck';
import { withDpi } from './dpi';
import type { LoadedProject } from './project';
import { renderCard, templateFor } from './render';
import { normalizeKey } from './text';
import type { CardRow, Mm, Project } from './types';

export type ExportFormat = 'png' | 'jpg';

export interface ExportOptions {
  /** Entero: JPG solo guarda ppp enteros. */
  dpi: number;
  lang: string;
  format: ExportFormat;
  /** Calidad JPG, de 0 a 1. */
  quality: number;
  /** Añadir "_es" al nombre cuando el proyecto tiene varios idiomas. */
  langSuffix: boolean;
}

export const MANIFEST_FILE = 'manifest.json';

/** Siempre a tamaño completo con sangrado y sin guías. */
export async function cardBlob(row: CardRow, lp: LoadedProject, opts: ExportOptions): Promise<Blob> {
  const { canvas } = await renderCard(row, lp, { dpi: opts.dpi, lang: opts.lang, bleed: true });
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, opts.quality));
  if (!blob) throw new Error('No se pudo generar la imagen.');
  return withDpi(blob, opts.dpi);
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'carta'
  );
}

export function cardFileName(row: CardRow, index: number, opts: Pick<ExportOptions, 'format' | 'lang' | 'langSuffix'>): string {
  const base = slug(row.id?.trim() || `fila${index + 1}`);
  return `${base}${opts.langSuffix && opts.lang ? `_${opts.lang}` : ''}.${opts.format}`;
}

/** Nombre de archivo de cada fila; si dos ids dan el mismo nombre, el segundo lleva «-2». */
export function fileNames(indices: number[], rows: CardRow[], opts: Pick<ExportOptions, 'format' | 'lang' | 'langSuffix'>) {
  const names = new Map<number, string>();
  const taken = new Set<string>();
  for (const i of indices) {
    if (names.has(i)) continue;
    const first = cardFileName(rows[i], i, opts);
    const dot = first.lastIndexOf('.');
    let name = first;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${first.slice(0, dot)}-${n}${first.slice(dot)}`;
    taken.add(name.toLowerCase());
    names.set(i, name);
  }
  return names;
}

// ---------------------------------------------------------------- manifiesto (provisional)

export interface ManifestImage {
  id: string;
  tipo: string;
  trimMm: { width: Mm; height: Mm };
  safeMm: Mm;
  px: CardPixels;
}

export interface Manifest {
  schema: 'creador-de-cartas/manifest';
  version: 1;
  /** El formato se cerrará junto con el programa que monta los PDF. */
  provisional: true;
  project: string;
  exportedAt: string;
  lang: string;
  dpi: number;
  format: ExportFormat;
  bleedMm: Mm;
  cards: { id: string; tipo: string; copies: number; front: string; back: string | null }[];
  images: Record<string, ManifestImage>;
}

export function buildManifest(
  plan: ExportPlan,
  rows: CardRow[],
  project: Project,
  opts: ExportOptions,
  names: Map<number, string>,
  exportedAt: string,
): Manifest {
  const images: Record<string, ManifestImage> = {};
  for (const i of [...plan.fronts.map((f) => f.index), ...plan.backs]) {
    const row = rows[i];
    const size = cardSizeFor(project, templateFor(project, row));
    images[names.get(i)!] = {
      id: row.id?.trim() ?? '',
      tipo: normalizeKey(row.tipo ?? ''),
      trimMm: { width: size.width, height: size.height },
      safeMm: size.safe ?? 0,
      px: cardPixels(size, opts.dpi),
    };
  }
  return {
    schema: 'creador-de-cartas/manifest',
    version: 1,
    provisional: true,
    project: project.name,
    exportedAt,
    lang: opts.lang,
    dpi: opts.dpi,
    format: opts.format,
    bleedMm: BLEED_MM,
    cards: plan.fronts.map((f) => ({
      id: rows[f.index].id?.trim() ?? '',
      tipo: normalizeKey(rows[f.index].tipo ?? ''),
      copies: f.copies,
      front: names.get(f.index)!,
      back: f.back === null ? null : names.get(f.back)!,
    })),
    images,
  };
}

/** Cada imagen se genera una sola vez aunque varias cartas compartan trasera. */
export async function exportZip(
  plan: ExportPlan,
  lp: LoadedProject,
  opts: ExportOptions,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const indices = [...plan.fronts.map((f) => f.index), ...plan.backs];
  const names = fileNames(indices, lp.rows, opts);
  const zip = new JSZip();
  let done = 0;
  for (const [i, name] of names) {
    zip.file(name, await cardBlob(lp.rows[i], lp, opts));
    onProgress(++done, names.size);
  }
  const manifest = buildManifest(plan, lp.rows, lp.project, opts, names, new Date().toISOString());
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
