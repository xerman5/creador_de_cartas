import { describe, expect, it } from 'vitest';
import { defaultAnswers, resolvedType, type WizardAnswers } from './answers';

const answers = (): WizardAnswers => ({
  ...defaultAnswers(),
  types: [
    { label: 'Grupos', count: 5, elements: ['art', 'stats'], attributes: [] },
    { label: 'Otro', count: 5, elements: [], attributes: [], sameAs: 'grupos' },
  ],
});

describe('resolvedType', () => {
  it('atributos marcados sin elegir: se preguntan pero no se dibujan', () => {
    const r = resolvedType(answers(), answers().types[0]);
    expect(r.declared.has('stats')).toBe(true);
    expect(r.elements.has('stats')).toBe(false);
    expect(r.attributes).toEqual([]);
  });

  it('con atributos elegidos se dibujan; «igual que» los hereda', () => {
    const a = answers();
    a.types[0].attributes = ['ataque', 'desconocido'];
    expect(resolvedType(a, a.types[0]).attributes).toEqual(['ataque']);
    const other = resolvedType(a, a.types[1]);
    expect(other.elements.has('stats')).toBe(true);
    expect(other.attributes).toEqual(['ataque']);
  });

  it('«igual que» en ciclo no se cuelga', () => {
    const a = answers();
    a.types[0].sameAs = 'Otro';
    expect(() => resolvedType(a, a.types[0])).not.toThrow();
  });
});
