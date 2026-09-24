import Papa from 'papaparse';
import type { CardRow } from './types';
import { normalizeKey } from './text';

export interface CsvData {
  rows: CardRow[];
  columns: string[];
  errors: string[];
}

/** Excel en español exporta con ";". Se decide por la cabecera para no confundirse con los "|" de atributos. */
function detectDelimiter(text: string): string {
  const header = text.slice(0, text.indexOf('\n') >>> 0);
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, c) => (header.split(c).length > header.split(best).length ? c : best));
}

export function parseCsv(text: string): CsvData {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: detectDelimiter(text),
    skipEmptyLines: 'greedy',
    transformHeader: (h) => normalizeKey(h),
  });

  const errors = res.errors.slice(0, 20).map((e) => `CSV fila ${(e.row ?? 0) + 2}: ${e.message}`);
  const columns = (res.meta.fields ?? []).filter(Boolean);
  const rows = res.data.map((r) => {
    const row: CardRow = {};
    for (const c of columns) row[c] = String(r[c] ?? '');
    return row;
  });

  if (!columns.includes('tipo')) errors.push('El CSV no tiene columna «tipo».');
  if (!columns.includes('id')) errors.push('El CSV no tiene columna «id».');

  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id) continue;
    if (seen.has(id)) errors.push(`id repetido: «${id}»`);
    seen.add(id);
  }

  return { rows, columns, errors };
}

/** Idiomas presentes en el CSV, deducidos de columnas como `titulo-es`, `titulo-en`. */
export function detectLangs(columns: string[]): string[] {
  const langs = new Set<string>();
  for (const c of columns) {
    const m = /-([a-z]{2})$/.exec(c);
    if (m) langs.add(m[1]);
  }
  return [...langs];
}
