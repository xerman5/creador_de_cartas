import { downloadZip } from 'client-zip';
import type { FileSource } from './assets';
import { BLEED_MM, cardPixels, cardSizeFor, type CardPixels } from './card';
import type { ExportPlan } from './deck';
import { withMetadata } from './metadata';
import type { LoadedProject } from './project';
import { renderCard, templateFor } from './render';
import { normalizeKey } from './text';
import type { CardRow, ExportSettings, Mm, Project } from './types';

export type ExportFormat = ExportSettings['format'];

export const DEFAULT_EXPORT: ExportSettings = { dpi: 300, format: 'png', quality: 95 };

/** Ajustes del proyecto con valores por defecto y dentro de rango. */
export function exportSettings(project: Project): ExportSettings {
  const e = { ...DEFAULT_EXPORT, ...project.export };
  return {
    dpi: Math.min(1200, Math.max(72, Math.round(Number(e.dpi) || DEFAULT_EXPORT.dpi))),
    format: e.format === 'jpg' ? 'jpg' : 'png',
    quality: Math.min(100, Math.max(50, Math.round(Number(e.quality) || DEFAULT_EXPORT.quality))),
  };
}

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
  return withMetadata(blob, opts.dpi);
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

export interface ExportFile {
  name: string;
  input: Blob | string;
}

/**
 * Genera los archivos de la exportación de uno en uno, bajo demanda: quien los consume
 * (zip en streaming o carpeta) marca el ritmo y solo hay una imagen en memoria a la vez.
 * Cada imagen se genera una sola vez aunque varias cartas compartan trasera.
 */
export async function* exportFiles(
  plan: ExportPlan,
  lp: LoadedProject,
  opts: ExportOptions,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): AsyncGenerator<ExportFile> {
  const indices = [...plan.fronts.map((f) => f.index), ...plan.backs];
  const names = fileNames(indices, lp.rows, opts);
  let done = 0;
  for (const [i, name] of names) {
    signal?.throwIfAborted();
    const input = await cardBlob(lp.rows[i], lp, opts);
    signal?.throwIfAborted();
    yield { name, input };
    onProgress?.(++done, names.size);
  }
  const manifest = buildManifest(plan, lp.rows, lp.project, opts, names, new Date().toISOString());
  yield { name: MANIFEST_FILE, input: JSON.stringify(manifest, null, 2) + '\n' };
}

/**
 * Zip en streaming. Con `showSaveFilePicker` (Chrome/Edge) se escribe directamente en disco;
 * si no, el navegador guarda el blob (en disco si es grande) y se descarga.
 * Devuelve false si el usuario cancela el diálogo de guardar.
 */
export async function saveZip(files: AsyncIterable<ExportFile>, fileName: string, signal?: AbortSignal): Promise<boolean> {
  if (window.showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Archivo zip', accept: { 'application/zip': ['.zip'] } }],
      });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      throw e;
    }
    const writable = await handle.createWritable();
    await downloadZip(files).body!.pipeTo(writable, { signal });
    return true;
  }
  const blob = await downloadZip(files).blob();
  signal?.throwIfAborted();
  downloadBlob(blob, fileName);
  return true;
}

/** Solo nombres simples: nunca se borra nada fuera de la carpeta de exportación. */
const PLAIN_NAME = /^[\w.-]+$/;

/**
 * Escribe la exportación en `dir` dentro de la carpeta del proyecto. La carpeta refleja
 * la última exportación: se borran los archivos que declaraba el manifiesto anterior y ya
 * no se generan. Nada que no figure en ese manifiesto se toca.
 */
export async function saveToFolder(files: AsyncIterable<ExportFile>, source: FileSource, dir: string, signal?: AbortSignal) {
  if (!source.write) throw new Error('Esta carpeta no admite escritura.');
  // Antes de nada: el navegador solo concede el permiso inmediatamente después del clic.
  await source.requestWrite?.();
  const previous = new Set<string>();
  const old = await source.read(`${dir}/${MANIFEST_FILE}`);
  if (old) {
    try {
      const m = JSON.parse(await old.text()) as Partial<Manifest>;
      for (const name of Object.keys(m.images ?? {})) if (PLAIN_NAME.test(name)) previous.add(name);
    } catch {
      // manifiesto ilegible: no se borra nada
    }
  }
  const written = new Set<string>();
  for await (const f of files) {
    signal?.throwIfAborted();
    await source.write(`${dir}/${f.name}`, f.input);
    written.add(f.name);
  }
  for (const name of previous) if (!written.has(name)) await source.remove?.(`${dir}/${name}`);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
