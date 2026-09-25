import { parseAttributes, type AttributeValue } from './attributes';
import { normalizeKey } from './text';
import type { CardRow, Project, Rect } from './types';

/** Id para una carta nueva de un tipo: sigue la numeración de las que ya hay («CRI-007» → «CRI-008»). */
export function nextId(rows: CardRow[], tipo: string): string {
  const ids = new Set(rows.map((r) => r.id?.trim()).filter(Boolean));
  const own = rows.filter((r) => normalizeKey(r.tipo ?? '') === normalizeKey(tipo)).map((r) => r.id?.trim() ?? '');
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const id of own) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (m && (!best || +m[2] > best.n)) best = { prefix: m[1], n: +m[2], width: m[2].length };
  }
  const base = best ?? { prefix: `${(normalizeKey(tipo).replace(/[^a-z0-9]/g, '').toUpperCase() + 'XXX').slice(0, 3)}-`, n: 0, width: 3 };
  for (let n = base.n + 1; ; n++) {
    const id = `${base.prefix}${String(n).padStart(base.width, '0')}`;
    if (!ids.has(id)) return id;
  }
}

export function formatAttributes(items: AttributeValue[]): string {
  return items.map((it) => `${it.key}${it.value ? `:${it.value}` : ''}${it.icon ? `@${it.icon}` : ''}`).join(' | ');
}

/**
 * Cambia un atributo dentro de la celda: `null` lo quita; una cadena lo pone con ese valor
 * (vacía = sin número, una habilidad). Los demás se quedan como estaban, en su orden.
 */
export function setAttribute(cell: string, key: string, value: string | null): string {
  const items = parseAttributes(cell);
  const k = normalizeKey(key);
  const i = items.findIndex((it) => it.key === k);
  if (value === null) {
    if (i >= 0) items.splice(i, 1);
  } else if (i >= 0) items[i] = { ...items[i], value: value.trim() };
  else items.push({ key: k, value: value.trim() });
  return formatAttributes(items);
}

export interface ColumnInfo {
  /** Columna con la ruta de una imagen. */
  image?: boolean;
  /** Columna con el encuadre de esa imagen y la forma de su zona (para encuadrarla). */
  crop?: { column: string; rect: Rect };
  /** Columna de atributos. */
  attributes?: boolean;
  /** Texto largo: se edita en varias líneas. */
  long?: boolean;
}

/** Qué hay en cada columna, según cómo la usan las plantillas. */
export function columnInfo(project: Project, columns: string[]): Record<string, ColumnInfo> {
  const out: Record<string, ColumnInfo> = Object.fromEntries(columns.map((c) => [c, {}]));
  const base = (c: string) => c.replace(/-[a-z]{2}$/, '');
  const mark = (bind: string | undefined, info: ColumnInfo) => {
    if (!bind) return;
    const key = normalizeKey(bind);
    for (const c of columns) if (c === key || base(c) === key) Object.assign(out[c], info);
  };
  for (const tpl of Object.values(project.templates))
    for (const z of tpl.zones) {
      if (z.type === 'image') {
        mark(z.bind, { image: true, ...(z.cropBind ? { crop: { column: normalizeKey(z.cropBind), rect: z.rect } } : {}) });
      } else if (z.type === 'attributes' || z.type === 'attribute') mark(z.bind ?? 'atributos', { attributes: true });
      else if (z.type === 'text' && z.rect.h >= 12) mark(z.bind, { long: true });
    }
  return out;
}
