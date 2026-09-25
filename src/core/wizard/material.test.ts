import { describe, expect, it } from 'vitest';
import { defaultAnswers, relang } from './answers';
import { deduceFromCsv } from './material';

describe('una hoja de cálculo como material', () => {
  it('crea los tipos (con clase), los atributos, las habilidades, la facción y los elementos que usa', () => {
    const csv = [
      'tipo,clase,subclase,nombre,texto,ataque,defensa,volar,faccion',
      'Elfo Ataque,Elfo,Ataque,Arquera,Dispara dos veces,3,1,x,Bosque',
      'Elfo Ataque,Elfo,Ataque,Lancero,,2,2,,Bosque',
      ',Orco,Recurso,Oro,,,,,Montaña',
      'Lugar,,,Playa,Todos roban,,,,',
    ].join('\n');
    const { answers, notes, report } = deduceFromCsv(defaultAnswers(), csv);
    expect(answers.types.map((t) => [t.clase, t.label, t.count])).toEqual([
      ['Elfo', 'Ataque', 2],
      ['Orco', 'Recurso', 1],
      [undefined, 'Lugar', 1],
    ]);
    expect(answers.attributes.map((a) => [a.label, a.kind ?? 'number'])).toEqual([
      ['Ataque', 'number'],
      ['Vida', 'number'],
      ['Defensa', 'number'],
      ['Volar', 'icon'],
    ]);
    expect(answers.variant.column).toBe('Faccion');
    expect(answers.variant.values.map((v) => v.name)).toEqual(['Bosque', 'Montaña']);
    const [elfo, orco, lugar] = answers.types;
    expect(elfo.elements).toEqual(expect.arrayContaining(['art', 'rules', 'stats', 'variant']));
    expect(elfo.attributes).toEqual(['ataque', 'defensa', 'volar']);
    expect(orco.elements).not.toContain('rules');
    expect(lugar.elements).toContain('rules');
    expect(elfo.cards?.[0]).toMatchObject({ titulo: 'Arquera', descripcion: 'Dispara dos veces', 'attr:ataque': '3', 'attr:volar': 'x', variante: 'Bosque' });
    expect(report.byType).toEqual({ 'Elfo · Ataque': 2, 'Orco · Recurso': 1, Lugar: 1 });
    expect(notes.join(' | ')).toContain('Tipos nuevos: Elfo · Ataque (2), Orco · Recurso (1), Lugar (1)');
    expect(notes.join(' | ')).toContain('Habilidades: Volar');
  });

  it('los idiomas salen de las columnas; los tipos que ya existen solo reciben sus cartas', () => {
    const a = defaultAnswers();
    a.types = [{ label: 'Lugar', count: 3, elements: ['art'], attributes: [], cards: [{ titulo: 'Viejo' }] }];
    const csv = 'id;tipo;titulo-es;titulo-en\nl1;Lugares;Playa;Beach\nl2;lugar;Cueva;Cave\n';
    const { answers, notes } = deduceFromCsv(a, csv);
    expect(answers.langs).toEqual(['es', 'en']);
    expect(answers.types).toHaveLength(1);
    expect(answers.types[0].cards).toEqual([
      { id: 'l1', 'titulo-es': 'Playa', 'titulo-en': 'Beach' },
      { id: 'l2', 'titulo-es': 'Cueva', 'titulo-en': 'Cave' },
    ]);
    expect(notes).toEqual(['Idiomas: es, en']);
  });

  it('solo en inglés: sustituye al español de partida', () => {
    const { answers } = deduceFromCsv(defaultAnswers(), 'tipo,titulo-en\nSpell,Fireball\n');
    expect(answers.langs).toEqual(['en']);
    expect(answers.types[0].cards?.[0]).toEqual({ titulo: 'Fireball' });
  });
});

describe('relang', () => {
  it('mueve los textos al cambiar de idiomas y guarda los del idioma que se quita', () => {
    const types = [{ label: 'X', count: 1, elements: [], attributes: [], cards: [{ titulo: 'Hola', descripcion: 'Reglas', id: 'a' }] }];
    const two = relang(types, ['es'], ['es', 'en']);
    expect(two[0].cards).toEqual([{ id: 'a', 'titulo-es': 'Hola', 'descripcion-es': 'Reglas' }]);
    two[0].cards![0]['titulo-en'] = 'Hello';
    const back = relang(two, ['es', 'en'], ['es']);
    expect(back[0].cards).toEqual([{ id: 'a', titulo: 'Hola', descripcion: 'Reglas', 'titulo-en': 'Hello' }]);
    expect(relang(back, ['es'], ['es', 'en'])[0].cards).toEqual(two[0].cards);
  });
});
