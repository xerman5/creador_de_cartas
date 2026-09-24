import { describe, expect, it } from 'vitest';
import { defaultAnswers, type WizardAnswers } from './answers';
import { buildProject } from './build';
import { fillCsv, importCsv, tableColumns } from './table';

function game(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return {
    ...defaultAnswers(),
    name: 'Clanes',
    types: [
      { label: 'Clan', count: 3, elements: ['art', 'rules', 'cost', 'stats', 'variant'], attributes: ['ataque', 'vida'] },
      { label: 'Lugar', count: 2, elements: ['art', 'flavor'], attributes: [] },
    ],
    ...overrides,
  };
}

describe('tableColumns', () => {
  it('solo las columnas que usa el tipo, con los atributos por separado', () => {
    const a = game();
    expect(tableColumns(a, [a.types[0]]).map((c) => c.key)).toEqual(['id', 'titulo', 'descripcion', 'coste', 'attr:ataque', 'attr:vida', 'variante', 'ilustracion', 'copias']);
    expect(tableColumns(a, [a.types[1]]).map((c) => c.key)).toEqual(['id', 'titulo', 'sabor', 'ilustracion', 'copias']);
  });

  it('con varios idiomas, una columna por idioma o solo la del idioma pedido', () => {
    const a = game({ langs: ['es', 'en'] });
    expect(tableColumns(a, [a.types[1]]).map((c) => c.label)).toEqual(['Id', 'Título (es)', 'Título (en)', 'Ambientación (es)', 'Ambientación (en)', 'Ilustración', 'Copias']);
    expect(tableColumns(a, [a.types[1]], 'en').map((c) => c.key)).toEqual(['id', 'titulo-en', 'sabor-en', 'ilustracion', 'copias']);
  });
});

describe('fillCsv + importCsv', () => {
  it('ida y vuelta: lo que se descarga se vuelve a importar igual', () => {
    const a = game();
    a.types[0].cards = [{ titulo: 'Lobos', descripcion: 'Aúllan.', coste: '2', 'attr:ataque': '5', variante: 'Rara', ilustracion: 'lobos.png', copias: '3' }];
    const csv = fillCsv(a);
    expect(csv.startsWith('﻿id;tipo;titulo;descripcion;sabor;coste;ataque;vida;rareza;ilustracion;copias')).toBe(true);
    const { types, report } = importCsv(a, csv);
    expect(report).toEqual({ byType: { Clan: 3, Lugar: 2 }, unknownTypes: [], ignored: [] });
    expect(types[0].cards![0]).toEqual({
      id: 'CLA-001',
      titulo: 'Lobos',
      descripcion: 'Aúllan.',
      coste: '2',
      'attr:ataque': '5',
      variante: 'Rara',
      ilustracion: 'lobos.png',
      copias: '3',
    });
    expect(types[0].cards![1]).toEqual({ id: 'CLA-002' });
    expect(types[1].count).toBe(2);
  });

  it('importa el CSV del proyecto: atributos combinados y sin textos de relleno', () => {
    const a = game();
    const { types } = importCsv(a, buildProject(a).csv);
    const first = types[0].cards![0];
    expect(first.titulo).toBe('Clan 1');
    expect(first.descripcion).toBeUndefined();
    expect(first.coste).toBe('1');
    expect(first['attr:ataque']).toMatch(/^\d$/);
    expect(types[0].count).toBe(3);
  });

  it('acepta un CSV propio: otros nombres de columna, «;», tipo desconocido, sin columna tipo', () => {
    const a = game();
    const own = 'Nombre;Tipo;Texto;Clan;Imagen;Otra cosa\nLobos;clan;Aúllan.;Rara;lobos.png;x\nMar;Barco;;;;\n';
    const { types, report } = importCsv(a, own);
    expect(types[0].cards).toEqual([{ titulo: 'Lobos', descripcion: 'Aúllan.', variante: 'Rara', ilustracion: 'lobos.png' }]);
    expect(report.unknownTypes).toEqual(['Barco']);
    expect(report.ignored).toEqual(['otra cosa']);
    expect(types[1]).toBe(a.types[1]);

    const sinTipo = importCsv(a, 'titulo,sabor\nPlaya,Olas.\nBosque,\n', 1);
    expect(sinTipo.types[1].cards).toEqual([{ titulo: 'Playa', sabor: 'Olas.' }, { titulo: 'Bosque' }]);
    expect(sinTipo.types[1].count).toBe(2);
  });

  it('con varios idiomas, las columnas sin sufijo van al primero', () => {
    const a = game({ langs: ['es', 'en'] });
    const { types } = importCsv(a, 'tipo,titulo,titulo-en,titulo-fr\nLugar,Playa,Beach,Plage\n');
    expect(types[1].cards).toEqual([{ 'titulo-es': 'Playa', 'titulo-en': 'Beach' }]);
  });
});
