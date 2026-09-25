import { RESOURCE_FILE } from '../core/wizard/resources';

/** Tipo de dato al arrastrar una miniatura de la biblioteca: su ruta dentro de assets/. */
export const RESOURCE_MIME = 'application/x-recurso';

/** ¿Lo que se arrastra son archivos o un recurso de la biblioteca? */
export const acceptsDrop = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === RESOURCE_MIME);

/** Recurso de la biblioteca soltado, si lo es. */
export const droppedResource = (e: DragEvent) => e.dataTransfer?.getData(RESOURCE_MIME) || '';

/** Un archivo soltado y su ruta dentro de lo soltado («criatura/01.png»). */
export interface DroppedFile {
  file: File;
  path: string;
}

async function walk(entry: FileSystemEntry, out: DroppedFile[]) {
  if (entry.isFile) {
    const f = await new Promise<File>((ok, err) => (entry as FileSystemFileEntry).file(ok, err));
    if (RESOURCE_FILE.test(f.name)) out.push({ file: f, path: entry.fullPath.replace(/^\/+/, '') });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries devuelve los hijos por tandas hasta que devuelve una vacía.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Imágenes soltadas con su ruta, entrando en las carpetas. */
export async function droppedEntries(e: DragEvent): Promise<DroppedFile[]> {
  const dt = e.dataTransfer;
  if (!dt) return [];
  // Hay que pedir las entradas antes de cualquier await: después, el DataTransfer se vacía.
  const entries = [...dt.items].map((it) => (it.kind === 'file' ? it.webkitGetAsEntry() : null)).filter((x): x is FileSystemEntry => !!x);
  if (!entries.length) return [...dt.files].filter((f) => RESOURCE_FILE.test(f.name)).map((file) => ({ file, path: file.name }));
  const out: DroppedFile[] = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}

/** Imágenes soltadas, entrando en las carpetas. */
export async function droppedFiles(e: DragEvent): Promise<File[]> {
  return (await droppedEntries(e)).map((d) => d.file);
}
