import { normalizeKey } from './text';
import type { CardRow, Project } from './types';

/** `id` de la trasera: columna «trasera» («-» = ninguna) o, si está vacía, la de la plantilla. */
export function backRef(row: CardRow, project: Project): string {
  const own = row.trasera?.trim() ?? '';
  if (own === '-') return '';
  return own || project.templates[normalizeKey(row.tipo ?? '')]?.back?.trim() || '';
}

/** Columna «copias»: vacía = 1; 0 = no se exporta. */
export function copiesOf(row: CardRow): { copies: number; warning?: string } {
  const raw = row.copias?.trim() ?? '';
  if (!raw) return { copies: 1 };
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return { copies: n };
  return { copies: 1, warning: `«copias» no es un número entero: «${raw}»` };
}

export function cardLabel(row: CardRow, index: number): string {
  return row.id?.trim() || `fila ${index + 1}`;
}

export interface PlannedCard {
  index: number;
  copies: number;
  /** Índice de la fila que hace de trasera. */
  back: number | null;
}

export interface ExportPlan {
  fronts: PlannedCard[];
  /** Traseras que hay que generar, sin repetir. */
  backs: number[];
  warnings: { index: number; message: string }[];
}

/**
 * Qué se genera al exportar `selected` (índices de filas).
 * Una carta que otra usa como trasera y no tiene trasera propia es solo trasera:
 * se genera una vez y el manifiesto la enlaza, en vez de aparecer como carta.
 */
export function planExport(rows: CardRow[], selected: number[], project: Project): ExportPlan {
  const byId = new Map<string, number>();
  rows.forEach((r, i) => {
    const id = r.id?.trim();
    if (id && !byId.has(id)) byId.set(id, i);
  });

  const warnings: ExportPlan['warnings'] = [];
  const backOf = rows.map((row, i): number | null => {
    const ref = backRef(row, project);
    if (!ref) return null;
    const j = byId.get(ref);
    if (j === undefined) {
      if (selected.includes(i)) warnings.push({ index: i, message: `la trasera «${ref}» no existe en el CSV` });
      return null;
    }
    if (j === i) {
      // Una plantilla de traseras con `back` apuntando a sí misma: no es un error.
      if (row.trasera?.trim() === ref) warnings.push({ index: i, message: 'la carta es su propia trasera' });
      return null;
    }
    return j;
  });
  const backOnly = new Set(backOf.filter((j): j is number => j !== null && backOf[j] === null));

  const fronts: PlannedCard[] = [];
  const backs: number[] = [];
  const addBack = (j: number) => backs.includes(j) || backs.push(j);

  for (const i of selected) {
    if (backOnly.has(i)) {
      addBack(i);
      continue;
    }
    const { copies, warning } = copiesOf(rows[i]);
    if (warning) warnings.push({ index: i, message: warning });
    if (copies === 0) continue;
    const back = backOf[i];
    fronts.push({ index: i, copies, back });
    if (back !== null) addBack(back);
  }
  warnings.sort((a, b) => a.index - b.index);
  return { fronts, backs, warnings };
}
