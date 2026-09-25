import { normalizeKey } from '../text';
import { fileKey } from './answers';

/**
 * Recursos del proyecto, por estantes: cada uno es una carpeta dentro de assets/.
 * Las ilustraciones son muchas y pesadas: el asistente no las guarda en el progreso.
 */
export const SHELVES = [
  { id: 'iconos', label: 'Iconos', hint: 'Atributos, habilidades, coste: PNG con transparencia o SVG.' },
  { id: 'fondos', label: 'Fondos', hint: 'Fondos y marcos de carta: del tamaño de la carta con sangrado.' },
  { id: 'ilustraciones', label: 'Ilustraciones', hint: 'El arte de cada carta.' },
  { id: 'referencias', label: 'Referencias', hint: 'Bocetos o imágenes de ayuda («…(ref).png»): se ven al lado de la carta mientras la diseñas, nunca en ella.' },
] as const;
export type ShelfId = (typeof SHELVES)[number]['id'];

export const RESOURCE_FILE = /\.(png|jpe?g|webp|gif|svg)$/i;

/** Las fuentes van aparte: no son imágenes. */
export const FONTS_DIR = 'fuentes';
export const FONT_FILE = /\.(ttf|otf|woff2?)$/i;
export type ResourceDir = ShelfId | typeof FONTS_DIR;

/** «Cinzel-Bold.ttf» → «Cinzel Bold»: nombre de familia a partir del archivo. */
export const fontFamilyOf = (name: string) =>
  stem(name)
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/ (Regular|Normal|Book)$/i, '')
    .trim() || 'Fuente';

/** Ruta dentro de assets/ → archivo. */
export type Resources = Map<string, Blob>;

export const shelfOf = (path: string): ResourceDir | null => {
  const dir = path.split('/')[0];
  if (dir === FONTS_DIR) return FONTS_DIR;
  return SHELVES.some((s) => s.id === dir) ? (dir as ShelfId) : null;
};

/** Nombre sin carpeta ni extensión, para mostrar y para emparejar: «iconos/Volar.png» → «Volar». */
export const stem = (path: string) => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/** Ruta limpia y libre en un estante: «Mi Icono (2).PNG» → «iconos/mi-icono-2.png», o «…-2.png» si ya existe. */
export function resourcePath(shelf: ResourceDir, name: string, taken: (path: string) => boolean): string {
  const m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name.split(/[\\/]/).pop() ?? name)!;
  const base = fileKey(m[1] || 'recurso');
  const ext = (m[2] ?? '.png').toLowerCase().replace('.jpeg', '.jpg');
  let path = `${shelf}/${base}${ext}`;
  for (let n = 2; taken(path); n++) path = `${shelf}/${base}-${n}${ext}`;
  return path;
}

/**
 * Empareja archivos con nombres por el nombre del archivo, sin mayúsculas, tildes ni separadores:
 * «volar.png» o «Volar.svg» → «Volar». Devuelve nombre → archivo (el primero que encaje).
 */
export function matchByName<T extends { name: string }>(files: T[], names: string[]): Map<string, T> {
  const key = (s: string) => normalizeKey(s).replace(/[^a-z0-9]/g, '');
  const byKey = new Map<string, T>();
  for (const f of files) if (RESOURCE_FILE.test(f.name) && !byKey.has(key(stem(f.name)))) byKey.set(key(stem(f.name)), f);
  const out = new Map<string, T>();
  for (const n of names) {
    const f = byKey.get(key(n));
    if (f) out.set(n, f);
  }
  return out;
}

/** Recursos como archivos del proyecto. */
export function resourceFiles(res: Resources | undefined): Record<string, Blob> {
  return Object.fromEntries([...(res ?? [])].map(([path, blob]) => [`assets/${path}`, blob]));
}

// ------------------------------------------------------------ progreso

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

function fromDataUrl(url: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** Para el archivo de progreso: todo en un JSON. */
export async function encodeResources(res: Resources): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, blob] of res) out[path] = await toDataUrl(blob);
  return out;
}

/** Del archivo de progreso; ignora rutas fuera de los estantes o datos rotos. */
export function decodeResources(raw: unknown): Resources {
  const out: Resources = new Map();
  if (!raw || typeof raw !== 'object') return out;
  for (const [path, url] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof url !== 'string' || !shelfOf(path) || path.includes('..')) continue;
    const blob = fromDataUrl(url);
    if (blob) out.set(path, blob);
  }
  return out;
}
