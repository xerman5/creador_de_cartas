import { describe, expect, it } from 'vitest';
import { conditionMatches, parseCondition } from './condition';
import { templateColumns } from './project';

describe('parseCondition', () => {
  it('reconoce las cuatro formas', () => {
    expect(parseCondition('Rareza')).toEqual({ column: 'rareza', op: 'filled', values: [] });
    expect(parseCondition('!rareza')).toEqual({ column: 'rareza', op: 'empty', values: [] });
    expect(parseCondition('rareza = Legendaria | Épica')).toEqual({ column: 'rareza', op: 'eq', values: ['legendaria', 'epica'] });
    expect(parseCondition('rareza!=común')).toEqual({ column: 'rareza', op: 'ne', values: ['comun'] });
    expect(parseCondition('  ')).toBeNull();
  });
});

describe('conditionMatches', () => {
  const leg = { rareza: 'Legendaria', 'sello-es': 'Oro', vacia: '  ' };
  const com = { rareza: 'común' };

  it('sin condición siempre se dibuja', () => {
    expect(conditionMatches(undefined, com, 'es')).toBe(true);
    expect(conditionMatches('', com, 'es')).toBe(true);
  });

  it('columna con valor o vacía (los espacios cuentan como vacía)', () => {
    expect(conditionMatches('rareza', leg, 'es')).toBe(true);
    expect(conditionMatches('vacia', leg, 'es')).toBe(false);
    expect(conditionMatches('!vacia', leg, 'es')).toBe(true);
    expect(conditionMatches('!rareza', com, 'es')).toBe(false);
  });

  it('igualdad sin distinguir mayúsculas ni tildes, con alternativas', () => {
    expect(conditionMatches('rareza=legendaria', leg, 'es')).toBe(true);
    expect(conditionMatches('rareza=epica|legendaria', leg, 'es')).toBe(true);
    expect(conditionMatches('rareza=legendaria', com, 'es')).toBe(false);
    expect(conditionMatches('rareza!=comun', com, 'es')).toBe(false);
    expect(conditionMatches('rareza!=comun', {}, 'es')).toBe(true);
  });

  it('usa la columna del idioma', () => {
    expect(conditionMatches('sello=oro', leg, 'es')).toBe(true);
    expect(conditionMatches('sello', leg, 'en')).toBe(false);
  });
});

describe('templateColumns', () => {
  it('incluye las columnas de las condiciones', () => {
    const cols = templateColumns({
      zones: [
        { id: 'marco', type: 'image', rect: { x: 0, y: 0, w: 1, h: 1 }, default: 'x.png', showIf: 'rareza=legendaria' },
        { id: 't', type: 'text', bind: 'titulo', font: { family: 'serif', size: 8 }, rect: { x: 0, y: 0, w: 1, h: 1 } },
      ],
    });
    expect(cols).toEqual([
      { name: 'rareza', localized: false },
      { name: 'titulo', localized: true },
    ]);
  });
});
