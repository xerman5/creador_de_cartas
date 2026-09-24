import { getField, normalizeKey } from './text';
import type { CardRow } from './types';

export interface Condition {
  column: string;
  op: 'filled' | 'empty' | 'eq' | 'ne';
  /** Valores normalizados (sin tildes ni mayúsculas) para `eq` y `ne`. */
  values: string[];
}

/**
 * Condición de una zona:
 *   rareza                 la columna tiene valor
 *   !rareza                la columna está vacía
 *   rareza=legendaria      vale eso (o `legendaria|épica`: cualquiera de ellos)
 *   rareza!=común          vale otra cosa (o está vacía)
 */
export function parseCondition(src: string): Condition | null {
  const s = src.trim();
  if (!s) return null;
  const m = /^([^!=]+?)\s*(!=|=)\s*(.*)$/.exec(s);
  if (m) {
    const values = m[3].split('|').map(normalizeKey).filter(Boolean);
    return { column: normalizeKey(m[1]), op: m[2] === '=' ? 'eq' : 'ne', values };
  }
  if (s.startsWith('!')) return { column: normalizeKey(s.slice(1)), op: 'empty', values: [] };
  return { column: normalizeKey(s), op: 'filled', values: [] };
}

/** Sin condición (o vacía) la zona se dibuja siempre. */
export function conditionMatches(src: string | undefined, row: CardRow, lang: string): boolean {
  const c = parseCondition(src ?? '');
  if (!c) return true;
  const value = normalizeKey(getField(row, c.column, lang));
  switch (c.op) {
    case 'filled':
      return value !== '';
    case 'empty':
      return value === '';
    case 'eq':
      return c.values.includes(value);
    case 'ne':
      return !c.values.includes(value);
  }
}
