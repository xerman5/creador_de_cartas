import type { CardSize, Rect, Zone } from './types';

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

export interface SnapTargets {
  x: number[];
  y: number[];
}

export interface DragOptions {
  /** Rejilla en mm (0 = sin rejilla). */
  grid: number;
  /** Distancia en mm a la que un borde se pega a una guía. */
  threshold: number;
  /** Desactiva imanes y rejilla (tecla Alt). */
  free?: boolean;
}

const MIN = 1;
const round = (v: number) => Math.round(v * 100) / 100;

/** Bordes y centros de la carta, del margen de seguridad y del resto de zonas. */
export function snapTargets(size: CardSize, zones: Zone[], exclude: number): SnapTargets {
  const s = size.safe ?? 0;
  const x = [0, size.width / 2, size.width];
  const y = [0, size.height / 2, size.height];
  if (s > 0) x.push(s, size.width - s), y.push(s, size.height - s);
  zones.forEach((z, i) => {
    if (i === exclude || z.hidden) return;
    const r = z.rect;
    x.push(r.x, r.x + r.w / 2, r.x + r.w);
    y.push(r.y, r.y + r.h / 2, r.y + r.h);
  });
  return { x, y };
}

function snapValue(v: number, targets: number[], axis: Guide['axis'], opts: DragOptions, guides: Guide[]): number {
  if (!opts.free) {
    let best: number | null = null;
    for (const t of targets) {
      if (Math.abs(v - t) <= opts.threshold && (best === null || Math.abs(v - t) < Math.abs(v - best))) best = t;
    }
    if (best !== null) {
      guides.push({ axis, at: best });
      return best;
    }
    if (opts.grid) return Math.round(v / opts.grid) * opts.grid;
  }
  return round(v);
}

/** Al mover se prueba a pegar el borde inicial, el centro o el final; gana el más cercano. */
function snapSpan(pos: number, len: number, targets: number[], axis: Guide['axis'], opts: DragOptions, guides: Guide[]): number {
  if (!opts.free) {
    let best: { delta: number; at: number } | null = null;
    for (const offset of [0, len / 2, len]) {
      for (const t of targets) {
        const delta = t - (pos + offset);
        if (Math.abs(delta) <= opts.threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
      }
    }
    if (best) {
      guides.push({ axis, at: best.at });
      return pos + best.delta;
    }
    if (opts.grid) return Math.round(pos / opts.grid) * opts.grid;
  }
  return round(pos);
}

/** Nuevo rectángulo al arrastrar `handle` un desplazamiento (dx, dy) en mm desde `r0`. */
export function dragRect(r0: Rect, handle: Handle, dx: number, dy: number, targets: SnapTargets, opts: DragOptions) {
  const guides: Guide[] = [];
  if (handle === 'move') {
    const x = snapSpan(r0.x + dx, r0.w, targets.x, 'x', opts, guides);
    const y = snapSpan(r0.y + dy, r0.h, targets.y, 'y', opts, guides);
    return { rect: { x: round(x), y: round(y), w: r0.w, h: r0.h }, guides };
  }

  let L = r0.x;
  let T = r0.y;
  let R = r0.x + r0.w;
  let B = r0.y + r0.h;
  if (handle.includes('w')) L = snapValue(L + dx, targets.x, 'x', opts, guides);
  if (handle.includes('e')) R = snapValue(R + dx, targets.x, 'x', opts, guides);
  if (handle.includes('n')) T = snapValue(T + dy, targets.y, 'y', opts, guides);
  if (handle.includes('s')) B = snapValue(B + dy, targets.y, 'y', opts, guides);
  if (R - L < MIN) handle.includes('w') ? (L = R - MIN) : (R = L + MIN);
  if (B - T < MIN) handle.includes('n') ? (T = B - MIN) : (B = T + MIN);
  return { rect: { x: round(L), y: round(T), w: round(R - L), h: round(B - T) }, guides };
}
