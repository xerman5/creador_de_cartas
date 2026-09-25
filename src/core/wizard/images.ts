import { capitalize, compactKey, nearest, parseNumbered, typeMatchKey } from '../naming';
import { fileKey, typeLabel } from './answers';

export const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg)$/i;
/** Carpeta (dentro de assets/) donde se copian las ilustraciones elegidas en el asistente. */
export const IMAGES_DIR = 'ilustraciones';
/** Carpeta de las imágenes de referencia («…(ref).png»): bocetos que se ven al lado de la carta, nunca en ella. */
export const REFS_DIR = 'referencias';

/** Un tipo tal como lo necesita el emparejado: su subclase y su clase (si tiene). */
export interface TypeName {
  label: string;
  clase?: string;
}

export interface CardRef {
  type: number;
  index: number;
  id: string;
  /** Títulos escritos por el usuario (en cada idioma). */
  titles: string[];
}

export interface MatchResult {
  /** `tipo:índice` → ruta de la imagen dentro de la carpeta elegida. */
  assigned: Map<string, string>;
  unused: string[];
  byRule: { id: number; name: number; title: number; order: number };
}

export const cardRefKey = (type: number, index: number) => `${type}:${index}`;

/** ¿Es una imagen de referencia? («elfos-ataque-001(ref).png»). */
export const isRefFile = (path: string) => !!parseNumbered(path)?.ref || /[\s._-]*\(?\s*ref(erencia)?\s*\)?\.[^.]+$/i.test(path.split('/').pop() ?? '');

const stem = (path: string) => fileKey(path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[\s._-]*\(?\s*ref(erencia)?\s*\)?$/i, ''));
const parent = (path: string) => {
  const parts = path.split('/');
  return parts.length > 1 ? parts[parts.length - 2] : '';
};
const natural = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Empareja imágenes con cartas, en este orden:
 * 1. el nombre del archivo es el id de la carta («elfo-ataque-001.png»);
 * 2. el nombre es la clase, el tipo y el número de la carta dentro de ellos («Elfos-Ataque-3.jpg» → la
 *    tercera de Elfo · Ataque; sin importar plurales, mayúsculas ni separadores);
 * 3. el nombre del archivo es su título («guardian-de-ceniza.jpg»);
 * 4. con `byOrder`, las que sobran se reparten por orden alfabético entre las cartas sin imagen de
 *    su tipo: las de una subcarpeta con el nombre del tipo («criatura/…») o, si solo hay un tipo,
 *    todas las que queden.
 * Con `refs`, solo se emparejan las imágenes de referencia («(ref)»); sin él, solo las que no lo son.
 */
export function matchImages(cards: CardRef[], paths: string[], types: TypeName[], byOrder: boolean, refs = false): MatchResult {
  const available = paths.filter((p) => IMAGE_FILE.test(p) && isRefFile(p) === refs).sort(natural);
  const assigned = new Map<string, string>();
  const byRule = { id: 0, name: 0, title: 0, order: 0 };
  const take = (card: CardRef, path: string, rule: keyof typeof byRule) => {
    assigned.set(cardRefKey(card.type, card.index), path);
    available.splice(available.indexOf(path), 1);
    byRule[rule]++;
  };

  for (const card of cards) {
    const path = available.find((p) => stem(p) === fileKey(card.id));
    if (path) take(card, path, 'id');
  }
  const typeKeys = types.map((t) => typeMatchKey(t.clase, t.label));
  for (const card of cards) {
    if (assigned.has(cardRefKey(card.type, card.index))) continue;
    const path = available.find((p) => {
      const num = parseNumbered(p);
      return num && num.key === typeKeys[card.type] && num.n === card.index + 1;
    });
    if (path) take(card, path, 'name');
  }
  for (const card of cards) {
    if (assigned.has(cardRefKey(card.type, card.index))) continue;
    const keys = card.titles.map(fileKey).filter((k) => k !== 'x');
    const path = available.find((p) => keys.includes(stem(p)));
    if (path) take(card, path, 'title');
  }
  if (byOrder) {
    types.forEach((t, type) => {
      const pending = cards.filter((c) => c.type === type && !assigned.has(cardRefKey(c.type, c.index)));
      const pool = available.filter((p) => {
        const dir = parent(p);
        if (!dir) return types.length === 1;
        return typeMatchKey(dir) === typeKeys[type] || (!t.clase && typeMatchKey(dir) === typeMatchKey(t.label));
      });
      pending.forEach((card, i) => pool[i] && take(card, pool[i], 'order'));
    });
  }
  return { assigned, unused: available, byRule };
}

export interface NamingPlan {
  /** Tipos con imágenes numeradas más allá de sus cartas: cuántas cartas tendría que tener. */
  grow: { type: number; label: string; count: number }[];
  /** Nombres numerados que no son de ningún tipo: tipos que se pueden crear (o el que se quería decir). */
  newTypes: { clase?: string; label: string; key: string; count: number; files: string[]; suggestion?: number }[];
}

/**
 * Lo que dicen los nombres con la convención clase + tipo + número que aún no está en el asistente:
 * cartas que faltan en un tipo y tipos que no existen. Solo propone; no cambia nada.
 *
 * En un nombre de varias palabras, la primera es la clase si ya es una clase del juego o si los
 * archivos lo dejan claro (la misma primera palabra con otros tipos, u otra primera palabra con el
 * mismo tipo): «elfos-ataque», «elfos-lugares», «orcos-ataque» → clases Elfo y Orco. Si no, todas
 * las palabras son el nombre del tipo («carta-de-evento»).
 */
export function namingPlan(paths: string[], types: TypeName[], counts: number[], max = Infinity): NamingPlan {
  const typeKeys = types.map((t) => typeMatchKey(t.clase, t.label));
  const knownClases = new Set(types.filter((t) => t.clase?.trim()).map((t) => typeMatchKey(t.clase)));
  const parsed = paths
    .filter((p) => IMAGE_FILE.test(p))
    .sort(natural)
    .map((p) => ({ path: p, num: parseNumbered(p) }))
    .filter((x): x is { path: string; num: NonNullable<ReturnType<typeof parseNumbered>> } => !!x.num);

  const unknown = parsed.filter((x) => !typeKeys.includes(x.num.key));
  const first = (w: string[]) => compactKey(w[0]);
  const rest = (w: string[]) => compactKey(w.slice(1).join(''));
  const isClase = (w: string[]) =>
    w.length >= 2 &&
    (knownClases.has(first(w)) ||
      unknown.some((o) => first(o.num.words) === first(w) && rest(o.num.words) !== rest(w)) ||
      unknown.some((o) => o.num.words.length >= 2 && first(o.num.words) !== first(w) && rest(o.num.words) === rest(w)));
  const nice = (words: string[]) => capitalize(words.join(' ').toLowerCase());

  const plan: NamingPlan = { grow: [], newTypes: [] };
  const maxOf = new Map<number, number>();
  for (const x of parsed) {
    const type = typeKeys.indexOf(x.num.key);
    if (type >= 0) maxOf.set(type, Math.max(maxOf.get(type) ?? 0, x.num.n));
  }
  for (const [type, n] of maxOf) {
    const count = Math.min(max, n);
    if (count > (counts[type] ?? 0)) plan.grow.push({ type, label: typeLabel(types[type]), count });
  }

  const groups = new Map<string, NamingPlan['newTypes'][number] & { nums: number[] }>();
  for (const x of unknown) {
    const w = x.num.words;
    const clase = isClase(w) ? nice([w[0]]) : undefined;
    const label = nice(clase ? w.slice(1) : w);
    const g = groups.get(x.num.key) ?? { clase, label, key: x.num.key, count: 0, files: [], nums: [] };
    g.count = Math.min(max, Math.max(g.count, x.num.n));
    g.files.push(x.path);
    g.nums.push(x.num.n);
    groups.set(x.num.key, g);
  }
  const options = typeKeys.map((key, value) => ({ key, value }));
  for (const g of groups.values()) {
    const files = g.files.map((f, i) => [g.nums[i], f] as const).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
    plan.newTypes.push({ clase: g.clase, label: g.label, key: g.key, count: g.count, files, suggestion: nearest(g.key, options) });
  }
  return plan;
}
