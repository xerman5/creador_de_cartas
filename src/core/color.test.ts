import { describe, expect, it } from 'vitest';
import { pickColor, resolveColor } from './color';
import { templateColumns } from './project';

const palette = { fuego: '#cc3322', legendaria: '#e0a526' };

describe('resolveColor', () => {
  it('traduce nombres de la paleta sin distinguir mayúsculas ni tildes', () => {
    expect(resolveColor('Fuego', palette)).toBe('#cc3322');
    expect(resolveColor(' LEGENDARIA ', palette)).toBe('#e0a526');
  });

  it('deja pasar colores CSS y trata vacío y «-» como sin color', () => {
    expect(resolveColor('#123', palette)).toBe('#123');
    expect(resolveColor('crimson', undefined)).toBe('crimson');
    expect(resolveColor('', palette)).toBe('');
    expect(resolveColor('-', palette)).toBe('');
    expect(resolveColor(undefined, palette)).toBe('');
  });
});

describe('pickColor', () => {
  it('la celda manda; vacía usa el fijo; «-» quita el color', () => {
    expect(pickColor('fuego', '#000', palette)).toBe('#cc3322');
    expect(pickColor(' ', 'legendaria', palette)).toBe('#e0a526');
    expect(pickColor('-', '#000', palette)).toBe('');
    expect(pickColor('', undefined, palette)).toBe('');
  });
});

describe('templateColumns con colores', () => {
  it('incluye las columnas de relleno, borde y color de texto', () => {
    const font = { family: 'serif', size: 8 };
    const rect = { x: 0, y: 0, w: 1, h: 1 };
    expect(
      templateColumns({
        zones: [
          { id: 'cinta', type: 'shape', fillBind: 'Facción', strokeBind: 'borde', rect },
          { id: 't', type: 'text', bind: 'titulo', colorBind: 'facción', font, rect },
        ],
      }),
    ).toEqual([
      { name: 'faccion', localized: false },
      { name: 'borde', localized: false },
      { name: 'titulo', localized: true },
    ]);
  });
});
