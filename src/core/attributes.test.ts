import { describe, expect, it } from 'vitest';
import { parseAttributes } from './attributes';

describe('parseAttributes', () => {
  it('lee clave, valor e icono en orden', () => {
    expect(parseAttributes('Fuerza:3 | velocidad : 5 | vida:10@iconos/corazon.svg | escudo')).toEqual([
      { key: 'fuerza', value: '3', icon: undefined },
      { key: 'velocidad', value: '5', icon: undefined },
      { key: 'vida', value: '10', icon: 'iconos/corazon.svg' },
      { key: 'escudo', value: '', icon: undefined },
    ]);
  });

  it('admite valores de texto y celdas vacías', () => {
    expect(parseAttributes('daño:1d6')).toEqual([{ key: 'dano', value: '1d6', icon: undefined }]);
    expect(parseAttributes('  ')).toEqual([]);
  });
});
