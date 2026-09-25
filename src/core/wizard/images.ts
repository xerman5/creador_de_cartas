import { compactKey, nearestLabel, parseNumbered } from '../naming';
import { fileKey } from './answers';

export const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg)$/i;
/** Carpeta (dentro de assets/) donde se copian las ilustraciones elegidas en el asistente. */
export const IMAGES_DIR = 'ilustraciones';

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

const stem = (path: string) => fileKey(path.split('/').pop()!.replace(/\.[^.]+$/, ''));
const parent = (path: string) => {
  const parts = path.split('/');
  return parts.length > 1 ? fileKey(parts[parts.length - 2]) : '';
};
const natural = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Empareja imágenes con cartas, en este orden:
 * 1. el nombre del archivo es el id de la carta («lugar001.png», «CRI-001.png»);
 * 2. el nombre es el tipo y el número de la carta dentro del tipo («Lugar-3.jpg» → la tercera de Lugar);
 * 3. el nombre del archivo es su título («guardian-de-ceniza.jpg»);
 * 4. con `byOrder`, las que sobran se reparten por orden alfabético entre las cartas sin imagen de
 *    su tipo: las de una subcarpeta con el nombre del tipo («criatura/…») o, si solo hay un tipo,
 *    todas las que queden.
 */
export function matchImages(cards: CardRef[], paths: string[], typeLabels: string[], byOrder: boolean): MatchResult {
  const available = paths.filter((p) => IMAGE_FILE.test(p)).sort(natural);
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
  const typeKeys = typeLabels.map(compactKey);
  for (const card of cards) {
    if (assigned.has(cardRefKey(card.type, card.index))) continue;
    const path = available.find((p) => {
      const num = parseNumbered(p);
      return num && num.base === typeKeys[card.type] && num.n === card.index + 1;
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
    typeLabels.forEach((label, type) => {
      const pending = cards.filter((c) => c.type === type && !assigned.has(cardRefKey(c.type, c.index)));
      const pool = available.filter((p) => parent(p) === fileKey(label) || (typeLabels.length === 1 && !parent(p)));
      pending.forEach((card, i) => pool[i] && take(card, pool[i], 'order'));
    });
  }
  return { assigned, unused: available, byRule };
}

export interface NamingPlan {
  /** Tipos con imágenes numeradas más allá de sus cartas: cuántas cartas tendría que tener. */
  grow: { type: number; label: string; count: number }[];
  /** Nombres numerados que no son de ningún tipo: tipos que se pueden crear (o el que se quería decir). */
  newTypes: { label: string; base: string; count: number; files: string[]; suggestion?: string }[];
}

/**
 * Lo que dicen los nombres con la convención tipo + número que aún no está en el asistente:
 * cartas que faltan en un tipo y tipos que no existen. Solo propone; no cambia nada.
 */
export function namingPlan(paths: string[], typeLabels: string[], counts: number[], max = Infinity): NamingPlan {
  const typeKeys = typeLabels.map(compactKey);
  const groups = new Map<string, { label: string; max: number; files: [number, string][] }>();
  for (const p of paths.filter((x) => IMAGE_FILE.test(x)).sort(natural)) {
    const num = parseNumbered(p);
    if (!num) continue;
    const g = groups.get(num.base) ?? { label: num.label, max: 0, files: [] };
    g.max = Math.max(g.max, num.n);
    g.files.push([num.n, p]);
    groups.set(num.base, g);
  }
  const plan: NamingPlan = { grow: [], newTypes: [] };
  for (const [base, g] of groups) {
    const type = typeKeys.indexOf(base);
    const count = Math.min(max, g.max);
    if (type >= 0) {
      if (count > (counts[type] ?? 0)) plan.grow.push({ type, label: typeLabels[type], count });
    } else {
      const files = g.files.sort((a, b) => a[0] - b[0]).map(([, f]) => f);
      plan.newTypes.push({ label: g.label, base, count, files, suggestion: nearestLabel(base, typeLabels) });
    }
  }
  return plan;
}
