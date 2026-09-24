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
  byRule: { id: number; title: number; order: number };
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
 * 1. el nombre del archivo es el id de la carta («CRI-001.png»);
 * 2. el nombre del archivo es su título («guardian-de-ceniza.jpg»);
 * 3. con `byOrder`, las que sobran se reparten por orden alfabético entre las cartas sin imagen de
 *    su tipo: las de una subcarpeta con el nombre del tipo («criatura/…») o, si solo hay un tipo,
 *    todas las que queden.
 */
export function matchImages(cards: CardRef[], paths: string[], typeLabels: string[], byOrder: boolean): MatchResult {
  const available = paths.filter((p) => IMAGE_FILE.test(p)).sort(natural);
  const assigned = new Map<string, string>();
  const byRule = { id: 0, title: 0, order: 0 };
  const take = (card: CardRef, path: string, rule: keyof typeof byRule) => {
    assigned.set(cardRefKey(card.type, card.index), path);
    available.splice(available.indexOf(path), 1);
    byRule[rule]++;
  };

  for (const card of cards) {
    const path = available.find((p) => stem(p) === fileKey(card.id));
    if (path) take(card, path, 'id');
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
