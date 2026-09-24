import { describe, expect, it } from 'vitest';
import { cardPixels, safeAreaIssues } from './card';
import type { Template } from './types';

describe('cardPixels', () => {
  it('póker a 300 ppp', () => {
    expect(cardPixels({ width: 63, height: 88 }, 300)).toEqual({
      trimWidth: 744,
      trimHeight: 1039,
      bleed: 35,
      width: 814,
      height: 1109,
    });
  });

  it('el sangrado es igual en todos los lados aunque el total no sea entero', () => {
    const px = cardPixels({ width: 70, height: 120 }, 600);
    expect(px.bleed).toBe(71);
    expect(px.width - px.trimWidth).toBe(2 * px.bleed);
    expect(px.height - px.trimHeight).toBe(2 * px.bleed);
  });
});

describe('safeAreaIssues', () => {
  const size = { width: 63, height: 88, safe: 3 };
  const font = { family: 'serif', size: 8 };
  const tpl: Template = {
    zones: [
      { id: 'fondo', type: 'image', rect: { x: 0, y: 0, w: 63, h: 88 } },
      { id: 'ok', type: 'text', bind: 't', font, rect: { x: 3, y: 3, w: 57, h: 10 } },
      { id: 'con margen', type: 'text', bind: 't', font, padding: 2, rect: { x: 1, y: 70, w: 61, h: 17 } },
      { id: 'peligro', type: 'text', bind: 't', font, rect: { x: 1.5, y: 20, w: 20, h: 10 } },
      { id: 'fuera', type: 'attribute', key: 'vida', font, rect: { x: 58, y: 40, w: 8, h: 8 } },
      { id: 'oculta', type: 'text', bind: 't', font, hidden: true, rect: { x: 0, y: 0, w: 5, h: 5 } },
    ],
  };

  it('ignora imágenes, zonas ocultas y respeta el relleno de los textos', () => {
    expect(safeAreaIssues(tpl, size).map((i) => i.zone)).toEqual(['peligro', 'fuera']);
  });

  it('distingue la zona peligrosa de salirse del corte', () => {
    const [peligro, fuera] = safeAreaIssues(tpl, size);
    expect(peligro).toMatchObject({ index: 3, message: '«peligro» entra 1,5 mm en la zona peligrosa' });
    expect(fuera).toMatchObject({ index: 4, message: '«fuera» se sale del corte (3 mm)' });
  });

  it('sin margen de seguridad solo avisa al salirse del corte', () => {
    expect(safeAreaIssues(tpl, { ...size, safe: 0 }).map((i) => i.zone)).toEqual(['fuera']);
  });
});
