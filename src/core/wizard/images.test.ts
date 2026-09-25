import { describe, expect, it } from 'vitest';
import { cardRefKey, matchImages, namingPlan, type CardRef } from './images';

const cards: CardRef[] = [
  { type: 0, index: 0, id: 'CLA-001', titles: ['Lobos del Norte'] },
  { type: 0, index: 1, id: 'CLA-002', titles: [] },
  { type: 0, index: 2, id: 'CLA-003', titles: [] },
  { type: 1, index: 0, id: 'LUG-001', titles: ['Playa', 'Beach'] },
  { type: 1, index: 1, id: 'LUG-002', titles: [] },
];
const labels = ['Clan', 'Lugar'];

describe('matchImages', () => {
  it('primero por id, después por título (sin mayúsculas, tildes ni separadores)', () => {
    const r = matchImages(cards, ['cla-002.PNG', 'Lobos del norte.jpg', 'otros/beach.webp', 'notas.txt'], labels, false);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 1)]: 'cla-002.PNG',
      [cardRefKey(0, 0)]: 'Lobos del norte.jpg',
      [cardRefKey(1, 0)]: 'otros/beach.webp',
    });
    expect(r.byRule).toEqual({ id: 1, name: 0, title: 2, order: 0 });
    expect(r.unused).toEqual([]);
  });

  it('por orden solo dentro de la subcarpeta del tipo y en orden natural', () => {
    const r = matchImages(cards, ['clan/10.png', 'clan/2.png', 'lugar/a.png', 'suelta.png'], labels, true);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 0)]: 'clan/2.png',
      [cardRefKey(0, 1)]: 'clan/10.png',
      [cardRefKey(1, 0)]: 'lugar/a.png',
    });
    expect(r.unused).toEqual(['suelta.png']);
  });

  it('con un solo tipo, por orden usa también las imágenes sueltas; sin «por orden» no', () => {
    const one = cards.filter((c) => c.type === 0);
    expect(matchImages(one, ['b.png', 'a.png'], ['Clan'], true).assigned.get(cardRefKey(0, 1))).toBe('b.png');
    expect(matchImages(one, ['b.png', 'a.png'], ['Clan'], false).assigned.size).toBe(0);
  });

  it('una imagen nunca se asigna dos veces', () => {
    const dup: CardRef[] = [
      { type: 0, index: 0, id: 'A', titles: ['Lobo'] },
      { type: 0, index: 1, id: 'B', titles: ['Lobo'] },
    ];
    const r = matchImages(dup, ['lobo.png'], ['Clan'], true);
    expect([...r.assigned.values()]).toEqual(['lobo.png']);
  });
});

describe('convención tipo + número', () => {
  it('«lugar002.png» es la segunda carta de Lugar, después del id y antes del título', () => {
    const r = matchImages(cards, ['Lugar-2.jpg', 'clan_1.png', 'CLA-001.png', 'playa.png'], labels, false);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 0)]: 'CLA-001.png',
      [cardRefKey(1, 1)]: 'Lugar-2.jpg',
      [cardRefKey(1, 0)]: 'playa.png',
    });
    expect(r.byRule).toEqual({ id: 1, name: 1, title: 1, order: 0 });
    expect(r.unused).toEqual(['clan_1.png']);
  });

  it('propone las cartas que faltan y los tipos que no existen, con el que se quería decir', () => {
    const plan = namingPlan(['clan005.png', 'clan001.png', 'enemigo-1.png', 'Enemigo 12.png', 'lugares3.png', 'notas.txt', 'portada.png'], labels, [3, 2]);
    expect(plan.grow).toEqual([{ type: 0, label: 'Clan', count: 5 }]);
    expect(plan.newTypes).toEqual([
      { label: 'Enemigo', base: 'enemigo', count: 12, files: ['enemigo-1.png', 'Enemigo 12.png'] },
      { label: 'Lugares', base: 'lugares', count: 3, files: ['lugares3.png'], suggestion: 'Lugar' },
    ].map((t) => ({ suggestion: undefined, ...t })));
    expect(namingPlan(['clan900.png'], labels, [3, 2], 500).grow[0].count).toBe(500);
  });
});
