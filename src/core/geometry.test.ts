import { describe, expect, it } from 'vitest';
import { dragRect, drawRect, snapTargets } from './geometry';
import type { Zone } from './types';

const size = { width: 63, height: 88, safe: 3 };
const zone = (x: number, y: number, w: number, h: number): Zone => ({
  id: 'z',
  type: 'image',
  rect: { x, y, w, h },
});

describe('snapTargets', () => {
  it('incluye bordes y centro de la carta, margen de seguridad y otras zonas', () => {
    const t = snapTargets(size, [zone(10, 20, 10, 10), zone(0, 0, 1, 1)], 1);
    expect(t.x).toEqual(expect.arrayContaining([0, 31.5, 63, 3, 60, 10, 15, 20]));
    expect(t.y).toEqual(expect.arrayContaining([0, 44, 88, 3, 85, 20, 25, 30]));
    expect(t.x).not.toContain(1);
  });
});

describe('dragRect', () => {
  const targets = snapTargets(size, [], -1);
  const opts = { grid: 0.5, threshold: 1 };

  it('pega el borde más cercano al mover', () => {
    const { rect, guides } = dragRect({ x: 10, y: 10, w: 20, h: 10 }, 'move', -6.6, 0, targets, opts);
    expect(rect.x).toBe(3);
    expect(guides).toContainEqual({ axis: 'x', at: 3 });
  });

  it('usa la rejilla lejos de las guías', () => {
    const { rect } = dragRect({ x: 10, y: 10, w: 20, h: 10 }, 'move', 5.2, 5.3, targets, opts);
    expect(rect).toEqual({ x: 15, y: 15.5, w: 20, h: 10 });
  });

  it('Alt desactiva imanes y rejilla', () => {
    const { rect } = dragRect({ x: 10, y: 10, w: 20, h: 10 }, 'move', -6.6, 0.33, targets, { ...opts, free: true });
    expect(rect).toEqual({ x: 3.4, y: 10.33, w: 20, h: 10 });
  });

  it('redimensiona sin bajar del tamaño mínimo', () => {
    const { rect } = dragRect({ x: 10, y: 10, w: 20, h: 10 }, 'e', -40, 0, targets, opts);
    expect(rect.w).toBe(1);
    expect(rect.x).toBe(10);
  });
});

describe('drawRect', () => {
  const targets = snapTargets(size, [], -1);
  const opts = { grid: 0.5, threshold: 1 };

  it('normaliza el trazo hacia arriba e izquierda y pega las esquinas', () => {
    const { rect, guides } = drawRect({ x: 59.6, y: 40.2 }, { x: 3.4, y: 20.1 }, targets, opts);
    expect(rect).toEqual({ x: 3, y: 20, w: 57, h: 20 });
    expect(guides).toEqual(expect.arrayContaining([{ axis: 'x', at: 3 }, { axis: 'x', at: 60 }]));
  });

  it('nunca baja del tamaño mínimo', () => {
    expect(drawRect({ x: 10, y: 10 }, { x: 10, y: 10 }, targets, opts).rect).toEqual({ x: 10, y: 10, w: 1, h: 1 });
  });
});
