import { normalizeKey } from './text';

/**
 * Convención de nombres: el nombre dice el tipo de carta y su número dentro del tipo.
 * «lugar001.png», «Lugar-1.jpg», «carta_de_evento 03.webp»… Se ignoran mayúsculas, tildes,
 * separadores y ceros a la izquierda.
 */
export interface Numbered {
  /** Tipo en forma compacta, para comparar: «cartadeevento». */
  base: string;
  /** Número dentro del tipo, desde 1. */
  n: number;
  /** El tipo tal como está escrito, para poner nombre a un tipo nuevo: «Carta de evento». */
  label: string;
}

/** Forma compacta de un nombre, para comparar: sin mayúsculas, tildes ni separadores. */
export const compactKey = (s: string) => normalizeKey(s).replace(/[^a-z0-9]/g, '');

const stemOf = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '');

export function parseNumbered(name: string): Numbered | null {
  const stem = stemOf(name).trim();
  const m = /^(.*?)[\s._-]*(\d+)$/.exec(stem);
  if (!m) return null;
  const base = compactKey(m[1]);
  const n = parseInt(m[2], 10);
  if (!base || !(n >= 1) || /^\d/.test(base)) return null;
  const words = m[1]
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return { base, n, label: words.charAt(0).toUpperCase() + words.slice(1) };
}

/** Id con la convención: «lugar001», «carta-de-evento001». */
export function conventionalId(label: string, n: number, width = 3): string {
  const key = normalizeKey(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${key || 'carta'}${String(n).padStart(width, '0')}`;
}

/** Nombre de archivo con la convención, conservando la extensión: («lugares007.PNG», «Lugar») → «lugar007.png». */
export function conventionalName(path: string, label: string, n: number): string {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const ext = (/\.[^./]+$/.exec(path)?.[0] ?? '.png').toLowerCase();
  return `${dir}${conventionalId(label, n)}${ext}`;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** El tipo que probablemente se quería decir: plural («lugares» → Lugar) o una errata pequeña. */
export function nearestLabel(base: string, labels: string[]): string | undefined {
  let best: { label: string; d: number } | undefined;
  for (const label of labels) {
    const key = compactKey(label);
    if (!key) continue;
    const plural = base === `${key}s` || base === `${key}es` || key === `${base}s` || key === `${base}es`;
    const d = plural ? 0 : distance(base, key);
    const limit = Math.min(key.length, base.length) >= 5 ? 2 : 1;
    if (d <= limit && (!best || d < best.d)) best = { label, d };
  }
  return best?.label;
}
