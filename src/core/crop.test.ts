import { describe, expect, it } from 'vitest';
import { CENTERED, coverRect, formatCrop, parseCrop } from './crop';

describe('encuadre', () => {
  it('lee y escribe «x% y% zoom»; vacío o roto = centrada', () => {
    expect(parseCrop('')).toEqual(CENTERED);
    expect(parseCrop('30% 40% 1.5')).toEqual({ x: 0.3, y: 0.4, zoom: 1.5 });
    expect(parseCrop('30,40')).toEqual({ x: 0.3, y: 0.4, zoom: 1 });
    expect(parseCrop('abc 150% 99')).toEqual({ x: 0.5, y: 1, zoom: 5 });
    expect(formatCrop({ x: 0.3, y: 0.4, zoom: 1.5 })).toBe('30% 40% 1.5');
    expect(formatCrop(CENTERED)).toBe('');
  });

  it('cubre siempre la zona: el punto va al centro si se puede, si no se pega al borde', () => {
    const zone = { x: 0, y: 0, w: 100, h: 100 };
    // Imagen apaisada 200×100: sin zoom, solo se puede mover en horizontal.
    expect(coverRect(200, 100, zone, CENTERED)).toEqual({ x: -50, y: 0, w: 200, h: 100 });
    expect(coverRect(200, 100, zone, { x: 0, y: 0, zoom: 1 })).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(coverRect(200, 100, zone, { x: 1, y: 1, zoom: 1 })).toEqual({ x: -100, y: 0, w: 200, h: 100 });
    // Con zoom 2 también se puede mover en vertical.
    const r = coverRect(200, 100, zone, { x: 0.5, y: 0.25, zoom: 2 });
    expect(r).toEqual({ x: -150, y: 0, w: 400, h: 200 });
    for (const c of [CENTERED, { x: 0, y: 1, zoom: 3 }, { x: 0.9, y: 0.1, zoom: 1.2 }]) {
      const q = coverRect(80, 300, zone, c);
      expect(q.x).toBeLessThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(0);
      expect(q.x + q.w).toBeGreaterThanOrEqual(100);
      expect(q.y + q.h).toBeGreaterThanOrEqual(100);
    }
  });
});
