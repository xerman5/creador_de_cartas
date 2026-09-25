import { describe, expect, it } from 'vitest';
import { cardRefKey, isRefFile, matchImages, namingPlan, type CardRef, type TypeName } from './images';

const cards: CardRef[] = [
  { type: 0, index: 0, id: 'CLA-001', titles: ['Lobos del Norte'] },
  { type: 0, index: 1, id: 'CLA-002', titles: [] },
  { type: 0, index: 2, id: 'CLA-003', titles: [] },
  { type: 1, index: 0, id: 'LUG-001', titles: ['Playa', 'Beach'] },
  { type: 1, index: 1, id: 'LUG-002', titles: [] },
];
const types: TypeName[] = [{ label: 'Clan' }, { label: 'Lugar' }];

describe('matchImages', () => {
  it('primero por id, después por título (sin mayúsculas, tildes ni separadores)', () => {
    const r = matchImages(cards, ['cla-002.PNG', 'Lobos del norte.jpg', 'otros/beach.webp', 'notas.txt'], types, false);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 1)]: 'cla-002.PNG',
      [cardRefKey(0, 0)]: 'Lobos del norte.jpg',
      [cardRefKey(1, 0)]: 'otros/beach.webp',
    });
    expect(r.byRule).toEqual({ id: 1, name: 0, title: 2, order: 0 });
    expect(r.unused).toEqual([]);
  });

  it('por orden solo dentro de la subcarpeta del tipo y en orden natural', () => {
    const r = matchImages(cards, ['clan/10.png', 'clan/2.png', 'lugares/a.png', 'suelta.png'], types, true);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 0)]: 'clan/2.png',
      [cardRefKey(0, 1)]: 'clan/10.png',
      [cardRefKey(1, 0)]: 'lugares/a.png',
    });
    expect(r.unused).toEqual(['suelta.png']);
  });

  it('con un solo tipo, por orden usa también las imágenes sueltas; sin «por orden» no', () => {
    const one = cards.filter((c) => c.type === 0);
    expect(matchImages(one, ['b.png', 'a.png'], [{ label: 'Clan' }], true).assigned.get(cardRefKey(0, 1))).toBe('b.png');
    expect(matchImages(one, ['b.png', 'a.png'], [{ label: 'Clan' }], false).assigned.size).toBe(0);
  });

  it('una imagen nunca se asigna dos veces', () => {
    const dup: CardRef[] = [
      { type: 0, index: 0, id: 'A', titles: ['Lobo'] },
      { type: 0, index: 1, id: 'B', titles: ['Lobo'] },
    ];
    const r = matchImages(dup, ['lobo.png'], [{ label: 'Clan' }], true);
    expect([...r.assigned.values()]).toEqual(['lobo.png']);
  });
});

describe('convención clase + tipo + número', () => {
  it('«lugares-2.jpg» es la segunda carta de Lugar, después del id y antes del título', () => {
    const r = matchImages(cards, ['Lugares-2.jpg', 'clan_1.png', 'CLA-001.png', 'playa.png'], types, false);
    expect(Object.fromEntries(r.assigned)).toEqual({
      [cardRefKey(0, 0)]: 'CLA-001.png',
      [cardRefKey(1, 1)]: 'Lugares-2.jpg',
      [cardRefKey(1, 0)]: 'playa.png',
    });
    expect(r.byRule).toEqual({ id: 1, name: 1, title: 1, order: 0 });
    expect(r.unused).toEqual(['clan_1.png']);
  });

  it('con clase: «elfos-ataque-002.png» es la segunda de Elfo · Ataque; las referencias van aparte', () => {
    const elf: TypeName[] = [
      { clase: 'Elfo', label: 'Ataque' },
      { clase: 'Orco', label: 'Ataque' },
    ];
    const deck: CardRef[] = [0, 1].flatMap((type) => [0, 1].map((index) => ({ type, index, id: '', titles: [] })));
    const files = ['elfos-ataque-002.png', 'orcos-ataques-1.png', 'elfos-ataque-002(ref).png', 'Orcos_Ataque_02 ref.jpg'];
    expect(isRefFile('elfos-ataque-002(ref).png')).toBe(true);
    expect(isRefFile('Orcos_Ataque_02 ref.jpg')).toBe(true);
    expect(isRefFile('elfos-ataque-002.png')).toBe(false);
    const art = matchImages(deck, files, elf, false);
    expect(Object.fromEntries(art.assigned)).toEqual({ [cardRefKey(0, 1)]: 'elfos-ataque-002.png', [cardRefKey(1, 0)]: 'orcos-ataques-1.png' });
    const refs = matchImages(deck, files, elf, false, true);
    expect(Object.fromEntries(refs.assigned)).toEqual({ [cardRefKey(0, 1)]: 'elfos-ataque-002(ref).png', [cardRefKey(1, 1)]: 'Orcos_Ataque_02 ref.jpg' });
  });

  it('propone las cartas que faltan y los tipos que no existen, con su clase si los nombres la dicen', () => {
    const plan = namingPlan(
      [
        'clan005.png',
        'clan001.png',
        'elfos-ataque-001.png',
        'elfos-recursos-003.png',
        'elfos-lugares-001.png',
        'elfos-recursos-001(ref).png',
        'carta-de-evento-2.png',
        'lugra3.png',
        'portada.png',
      ],
      types,
      [3, 2],
    );
    expect(plan.grow).toEqual([{ type: 0, label: 'Clan', count: 5 }]);
    expect(plan.newTypes.map(({ clase, label, count, suggestion }) => ({ clase, label, count, suggestion }))).toEqual([
      { clase: undefined, label: 'Carta de evento', count: 2, suggestion: undefined },
      { clase: 'Elfo', label: 'Ataque', count: 1, suggestion: undefined },
      { clase: 'Elfo', label: 'Lugar', count: 1, suggestion: undefined },
      { clase: 'Elfo', label: 'Recurso', count: 3, suggestion: undefined },
      { clase: undefined, label: 'Lugra', count: 3, suggestion: 1 },
    ]);
    expect(plan.newTypes[3].files).toEqual(['elfos-recursos-001(ref).png', 'elfos-recursos-003.png']);
    expect(namingPlan(['clan900.png'], types, [3, 2], 500).grow[0].count).toBe(500);
  });

  it('«clan-energy-1…12»: grupo Clan, subgrupo Energy; después «clan-militar-1» va al mismo grupo', () => {
    const files = Array.from({ length: 12 }, (_, i) => `clan-energy-${i + 1}.png`);
    const plan = namingPlan(files, [{ label: '' }], [20]);
    expect(plan.newTypes.map(({ clase, label, count }) => ({ clase, label, count }))).toEqual([{ clase: 'Clan', label: 'Energy', count: 12 }]);
    const later = namingPlan(['clan-militar-1.png'], [{ clase: 'Clan', label: 'Energy' }], [12]);
    expect(later.newTypes[0]).toMatchObject({ clase: 'Clan', label: 'Militar', count: 1 });
    // Tres palabras sin enlaces: la primera es el grupo y el resto, el subgrupo.
    expect(namingPlan(['elfos-magia-oscura-2.png'], [], []).newTypes[0]).toMatchObject({ clase: 'Elfo', label: 'Magia oscura' });
  });

  it('una clase ya conocida se reconoce aunque solo haya un tipo nuevo', () => {
    const plan = namingPlan(['orcos-magia-001.png'], [{ clase: 'Orco', label: 'Ataque' }], [1]);
    expect(plan.newTypes[0]).toMatchObject({ clase: 'Orco', label: 'Magia', count: 1 });
  });
});
