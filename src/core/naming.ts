import { normalizeKey } from './text';

/**
 * Convención de nombres: el nombre dice la clase (opcional), el tipo o subclase y el número de la
 * carta dentro de ellos. «lugar-001.png», «elfos-ataque-001.png», «Carta de evento 3.webp»…
 * Se ignoran mayúsculas, tildes, separadores, plurales y ceros a la izquierda. Con «(ref)» al final,
 * «elfos-recursos-001(ref).png» es una imagen de referencia (un boceto) para esa carta.
 */
export interface Numbered {
  /** Palabras del nombre sin el número, en singular y tal como se escribieron: ["Elfo", "Ataque"]. */
  words: string[];
  /** Todo junto en forma compacta, para comparar: «elfoataque». */
  key: string;
  /** Número dentro de su tipo, desde 1. */
  n: number;
  /** Es una imagen de referencia, no la ilustración. */
  ref: boolean;
}

/** Forma compacta de un nombre, para comparar: sin mayúsculas, tildes ni separadores. */
export const compactKey = (s: string) => normalizeKey(s).replace(/[^a-z0-9]/g, '');

const stemOf = (name: string) => (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '');

/** Marca de referencia al final del nombre: «(ref)», «-ref», «_referencia», « ref». */
const REF = /[\s._-]*\(?\s*ref(?:erencia)?\s*\)?$/i;

/** Singular de una palabra en español, lo justo para nombres de tipos: elfos → elfo, lugares → lugar. */
export function singular(word: string): string {
  const w = word;
  if (w.length <= 3) return w;
  const lower = normalizeKey(w);
  if (/ces$/.test(lower)) return w.slice(0, -3) + (w.slice(-3, -2) === 'C' ? 'Z' : 'z');
  if (/[lrndjy]es$/.test(lower) && !/(ques|gues)$/.test(lower)) return w.slice(0, -2);
  if (/[^s]s$/.test(lower)) return w.slice(0, -1);
  return w;
}

/** Palabras de un nombre: separadores, «camelCase» y espacios. */
export function wordsOf(s: string): string[] {
  return s
    .replace(/([a-záéíóúñü])([A-ZÁÉÍÓÚÑÜ])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean);
}

/** Clave para comparar un nombre de tipo con los de los archivos: palabras en singular, todo junto. */
export const typeMatchKey = (...parts: (string | undefined)[]) =>
  compactKey(
    parts
      .filter(Boolean)
      .flatMap((p) => wordsOf(p!))
      .map(singular)
      .join(''),
  );

export function parseNumbered(name: string): Numbered | null {
  let stem = stemOf(name).trim();
  const ref = REF.test(stem) && !/^ref(erencia)?$/i.test(stem);
  if (ref) stem = stem.replace(REF, '');
  const m = /^(.*?)[\s._-]*(\d+)$/.exec(stem);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  const words = wordsOf(m[1]).map(singular);
  if (!words.length || !(n >= 1) || /^\d/.test(words[0])) return null;
  return { words, key: compactKey(words.join('')), n, ref };
}

/** «Elfo», «ataque» → «Elfo», «Ataque»: la primera letra en mayúscula. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Id con la convención: «lugar-001», «elfo-ataque-001», «carta-de-evento-012». */
export function conventionalId(parts: string | (string | undefined)[], n: number, width = 3): string {
  const key = (Array.isArray(parts) ? parts : [parts])
    .filter(Boolean)
    .map((p) =>
      normalizeKey(p!)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-');
  return `${key || 'carta'}-${String(n).padStart(width, '0')}`;
}

/** Nombre de archivo con la convención, conservando carpeta y extensión: «elfo-ataque-007.png». */
export function conventionalName(path: string, parts: string | (string | undefined)[], n: number, ref = false): string {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const ext = (/\.[^./]+$/.exec(path)?.[0] ?? '.png').toLowerCase();
  return `${dir}${conventionalId(parts, n)}${ref ? '(ref)' : ''}${ext}`;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** El nombre que probablemente se quería decir (una errata pequeña). Recibe claves compactas. */
export function nearest<T>(key: string, options: { key: string; value: T }[]): T | undefined {
  let best: { value: T; d: number } | undefined;
  for (const o of options) {
    if (!o.key || o.key === key) continue;
    const d = distance(key, o.key);
    const limit = Math.min(o.key.length, key.length) >= 5 ? 2 : 1;
    if (d <= limit && (!best || d < best.d)) best = { value: o.value, d };
  }
  return best?.value;
}
