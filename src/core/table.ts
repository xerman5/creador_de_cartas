import { parseAttributes, type AttributeValue } from './attributes';
import { compactKey, conventionalId, parseNumbered, typeMatchKey } from './naming';
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
  // Sin cartas de ese tipo, la convención tipo + número: «lugar001».
  const base = best ?? { prefix: conventionalId(tipo, 1).replace(/\d+$/, ''), n: 0, width: 3 };
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

export interface ByName {
  /** Fila → ruta de su imagen (dentro de assets/). */
  assigned: Map<number, string>;
  /** Fila → ruta de su imagen de referencia («…(ref).png»). */
  refs: Map<number, string>;
  /** Tipos con imágenes numeradas más allá de sus cartas: cuántas tienen y cuántas harían falta. */
  grow: { tipo: string; have: number; want: number }[];
}

/**
 * Asigna imágenes a las cartas por su nombre: el id de la carta («elfo-ataque-001.png») o su tipo
 * (con su clase) y su número dentro del tipo, en el orden de la tabla («Elfos-Ataque-3.jpg» → la
 * tercera de «Elfo Ataque»). Las de referencia («…(ref).png») van a la columna de referencia.
 * Solo en celdas vacías.
 */
export function imagesByName(rows: CardRow[], column: string, paths: string[], refColumn = 'referencia'): ByName {
  const parsed = paths.map((p) => ({ path: p, num: parseNumbered(p), ref: isRefFile(p), stem: compactKey(stripRef(p)) }));
  const out: ByName = { assigned: new Map(), refs: new Map(), grow: [] };
  const used = new Set(rows.flatMap((r) => [r[column]?.trim(), r[refColumn]?.trim()]).filter(Boolean));
  const position = new Map<string, number>();
  const count = new Map<string, { label: string; n: number }>();
  rows.forEach((row, i) => {
    const tipo = typeMatchKey(row.tipo ?? '');
    const pos = (position.get(tipo) ?? 0) + 1;
    position.set(tipo, pos);
    count.set(tipo, { label: row.tipo ?? '', n: pos });
    for (const ref of [false, true]) {
      const col = ref ? refColumn : column;
      if (row[col]?.trim()) continue;
      const pool = parsed.filter((x) => x.ref === ref && !used.has(x.path));
      const hit =
        (row.id?.trim() && pool.find((x) => x.stem === compactKey(row.id))) || pool.find((x) => x.num?.key === tipo && x.num.n === pos);
      if (hit) {
        (ref ? out.refs : out.assigned).set(i, hit.path);
        used.add(hit.path);
      }
    }
  });
  for (const [tipo, c] of count) {
    const want = Math.max(0, ...parsed.filter((x) => x.num?.key === tipo).map((x) => x.num!.n));
    if (want > c.n) out.grow.push({ tipo: c.label, have: c.n, want });
  }
  return out;
}

const stripRef = (p: string) => (p.split('/').pop() ?? p).replace(/\.[^.]+$/, '').replace(/[\s._-]*\(?\s*ref(erencia)?\s*\)?$/i, '');
const isRefFile = (p: string) => stripRef(p) !== (p.split('/').pop() ?? p).replace(/\.[^.]+$/, '');
