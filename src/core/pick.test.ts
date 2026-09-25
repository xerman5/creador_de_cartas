import { describe, expect, it } from 'vitest';
import { zoneAt } from './pick';
import type { Template } from './types';

const font = { family: 'x', size: 8 };
const tpl = {
  zones: [
    { id: 'fondo', type: 'shape', rect: { x: 0, y: 0, w: 63, h: 88 } },
    { id: 'arte', type: 'image', rect: { x: 5, y: 10, w: 53, h: 40 } },
    { id: 'caja', type: 'shape', rect: { x: 5, y: 55, w: 53, h: 28 } },
    { id: 'reglas', type: 'text', bind: 'd', rect: { x: 6, y: 56, w: 51, h: 26 }, font },
    { id: 'marca', type: 'text', bind: 'm', showIf: 'rareza', rect: { x: 50, y: 12, w: 6, h: 6 }, font },
  ],
} as Template;

describe('zoneAt', () => {
  it('prefiere el contenido a las formas, y las imágenes al fondo', () => {
    expect(zoneAt(tpl, {}, '', 30, 70)?.id).toBe('reglas');
    expect(zoneAt(tpl, {}, '', 30, 30)?.id).toBe('arte');
    expect(zoneAt(tpl, {}, '', 1, 1)?.id).toBe('fondo');
    expect(zoneAt(tpl, {}, '', 70, 1)).toBeNull();
  });

  it('una zona que no se dibuja en esa carta no cuenta', () => {
    expect(zoneAt(tpl, {}, '', 52, 14)?.id).toBe('arte');
    expect(zoneAt(tpl, { rareza: 'rara' }, '', 52, 14)?.id).toBe('marca');
  });
});
