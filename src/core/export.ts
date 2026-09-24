import JSZip from 'jszip';
import { withDpi } from './dpi';
import type { LoadedProject } from './project';
import { renderCard } from './render';
import type { CardRow } from './types';

export type ExportFormat = 'png' | 'jpg';

export interface ExportOptions {
  dpi: number;
  lang: string;
  format: ExportFormat;
  /** Añadir "_es" al nombre cuando el proyecto tiene varios idiomas. */
  langSuffix: boolean;
}

/** Siempre a tamaño completo con sangrado y sin guías. */
export async function cardBlob(row: CardRow, lp: LoadedProject, opts: ExportOptions): Promise<Blob> {
  const { canvas } = await renderCard(row, lp, { dpi: opts.dpi, lang: opts.lang, bleed: true });
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.95));
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

export function cardFileName(row: CardRow, index: number, opts: ExportOptions): string {
  const base = slug(row.id?.trim() || `fila${index + 1}`);
  return `${base}${opts.langSuffix && opts.lang ? `_${opts.lang}` : ''}.${opts.format}`;
}

export async function exportZip(
  entries: { row: CardRow; index: number }[],
  lp: LoadedProject,
  opts: ExportOptions,
  onProgress: (done: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  let done = 0;
  for (const { row, index } of entries) {
    zip.file(cardFileName(row, index, opts), await cardBlob(row, lp, opts));
    onProgress(++done);
  }
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
