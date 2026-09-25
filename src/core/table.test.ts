import { describe, expect, it } from 'vitest';
import { columnInfo, imagesByName, nextId, setAttribute } from './table';
import type { Project } from './types';

describe('tabla de cartas', () => {
  it('id nuevo siguiendo la numeración del tipo, sin repetir', () => {
    const rows = [
      { id: 'CRI-001', tipo: 'Criatura' },
      { id: 'CRI-009', tipo: 'Criatura' },
      { id: 'HEC-1', tipo: 'Hechizo' },
      { id: 'CRI-010', tipo: 'Otro' },
    ];
    expect(nextId(rows, 'criatura')).toBe('CRI-011');
    expect(nextId(rows, 'Hechizo')).toBe('HEC-2');
    expect(nextId(rows, 'Lugar')).toBe('lugar001');
  });

  it('pone, cambia y quita atributos de la celda sin tocar los demás', () => {
    const cell = 'coste:2 | ataque:3@iconos/x.png';
    expect(setAttribute(cell, 'Volar', '')).toBe('coste:2 | ataque:3@iconos/x.png | volar');
    expect(setAttribute(cell, 'ataque', '5')).toBe('coste:2 | ataque:5@iconos/x.png');
    expect(setAttribute(cell, 'coste', null)).toBe('ataque:3@iconos/x.png');
    expect(setAttribute('', 'vida', '4')).toBe('vida:4');
  });

  it('reconoce columnas de imagen (con su encuadre), de atributos y de texto largo', () => {
    const project = {
      templates: {
        c: {
          zones: [
            { id: 'a', type: 'image', bind: 'ilustracion', cropBind: 'encuadre', rect: { x: 0, y: 0, w: 50, h: 30 } },
            { id: 'b', type: 'text', bind: 'descripcion', rect: { x: 0, y: 40, w: 50, h: 30 }, font: { family: 'x', size: 8 } },
            { id: 't', type: 'text', bind: 'titulo', rect: { x: 0, y: 0, w: 50, h: 8 }, font: { family: 'x', size: 8 } },
            { id: 'd', type: 'attributes', rect: { x: 0, y: 0, w: 5, h: 30 }, iconSize: 4, font: { family: 'x', size: 8 } },
          ],
        },
      },
    } as unknown as Project;
    const info = columnInfo(project, ['id', 'titulo', 'descripcion-es', 'ilustracion', 'encuadre', 'atributos']);
    expect(info.ilustracion).toEqual({ image: true, crop: { column: 'encuadre', rect: { x: 0, y: 0, w: 50, h: 30 } } });
    expect(info['descripcion-es']).toEqual({ long: true });
    expect(info.titulo).toEqual({});
    expect(info.atributos).toEqual({ attributes: true });
  });
});

describe('imagesByName', () => {
  it('por id o por tipo y número, solo en celdas vacías y sin repetir; dice qué cartas faltan', () => {
    const rows = [
      { id: 'lugar001', tipo: 'Lugar', ilustracion: '' },
      { id: 'L-2', tipo: 'Lugar', ilustracion: '' },
      { id: 'x', tipo: 'Lugar', ilustracion: 'ilustraciones/mia.png' },
      { id: 'e1', tipo: 'Evento', ilustracion: '' },
    ];
    const r = imagesByName(rows, 'ilustracion', ['ilustraciones/lugar001.png', 'ilustraciones/Lugar-2.jpg', 'ilustraciones/lugar_3.png', 'ilustraciones/lugar-7.png', 'ilustraciones/otra.png']);
    expect(Object.fromEntries(r.assigned)).toEqual({ 0: 'ilustraciones/lugar001.png', 1: 'ilustraciones/Lugar-2.jpg' });
    expect(r.grow).toEqual([{ tipo: 'Lugar', have: 3, want: 7 }]);
  });
});
