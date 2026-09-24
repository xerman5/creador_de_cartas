import { normalizeKey } from './text';

/**
 * Un color escrito en la plantilla o en el CSV: nombre de la paleta del proyecto
 * («fuego», «Legendaria») o cualquier color CSS («#c33», «rgb(…)», «crimson»).
 * «-» o vacío = sin color.
 */
export function resolveColor(value: string | undefined, palette: Record<string, string> | undefined): string {
  const v = value?.trim() ?? '';
  if (!v || v === '-') return '';
  return palette?.[normalizeKey(v)] ?? v;
}

/** La celda de la columna manda sobre el color fijo; «-» en la celda quita el color en esa carta. */
export function pickColor(cell: string, fixed: string | undefined, palette: Record<string, string> | undefined): string {
  if (cell.trim() === '-') return '';
  return resolveColor(cell.trim() || fixed, palette);
}
