import Papa from 'papaparse';
import type { CardRow } from './types';
import { normalizeKey } from './text';

export interface CsvData {
  rows: CardRow[];
  columns: string[];
  errors: string[];
  format: CsvFormat;
}

/** Cómo estaba escrito el archivo, para volver a escribirlo igual. */
export interface CsvFormat {
  delimiter: string;
  /** Cabeceras tal como estaban (mismo orden que `columns`). */
  headers: string[];
  newline: '\n' | '\r\n';
  bom: boolean;
}

/** Excel en español exporta con ";". Se decide por la cabecera para no confundirse con los "|" de atributos. */
function detectDelimiter(text: string): string {
  const header = text.slice(0, text.indexOf('\n') >>> 0);
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, c) => (header.split(c).length > header.split(best).length ? c : best));
}

export function parseCsv(text: string): CsvData {
  const delimiter = detectDelimiter(text);
  const original: string[] = [];
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => {
      original.push(h.replace(/^\uFEFF/, ''));
      return normalizeKey(h);
    },
  });

  const errors = res.errors.slice(0, 20).map((e) => `CSV fila ${(e.row ?? 0) + 2}: ${e.message}`);
  const fields = res.meta.fields ?? [];
  const columns = fields.filter(Boolean);
  const headers = fields.flatMap((f, i) => (f ? [original[i] ?? f] : []));
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

  const format: CsvFormat = { delimiter, headers, newline: /\r\n/.test(text) ? '\r\n' : '\n', bom: text.startsWith('\uFEFF') };
  return { rows, columns, errors, format };
}

/** Escribe filas como CSV con el formato del archivo original (cabeceras, separador, saltos, BOM). */
export function serializeCsv(rows: CardRow[], columns: string[], format?: CsvFormat): string {
  const f: CsvFormat = format ?? { delimiter: ',', headers: [], newline: '\n', bom: false };
  const header = (c: string) => {
    const i = format ? format.headers.findIndex((h) => normalizeKey(h) === c) : -1;
    return i >= 0 ? f.headers[i] : c;
  };
  const text = Papa.unparse({ fields: columns.map(header), data: rows.map((r) => columns.map((c) => r[c] ?? '')) }, { delimiter: f.delimiter, newline: f.newline });
  return (f.bom ? '\uFEFF' : '') + text + f.newline;
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
