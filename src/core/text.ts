import type { CardRow } from './types';

/** "Descripción-ES " → "descripcion-es". Así el CSV tolera tildes, mayúsculas y espacios. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Valor de una columna, prefiriendo la versión del idioma (`titulo-es`) sobre la genérica (`titulo`). */
export function getField(row: CardRow, bind: string, lang: string): string {
  const key = normalizeKey(bind);
  const value = (lang ? row[`${key}-${lang}`] : undefined) ?? row[key];
  return (value ?? '').trim();
}

/** Lee texto en UTF-8 y, si no lo es (CSV guardado por Excel), cae a Windows-1252. */
export async function readText(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
