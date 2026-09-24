import { describe, expect, it } from 'vitest';
import { detectLangs, parseCsv } from './csv';

describe('parseCsv', () => {
  it('normaliza cabeceras y conserva los valores', () => {
    const { rows, columns, errors } = parseCsv('ID,Tipo,Título-ES\nC1,nave,Hola\n');
    expect(columns).toEqual(['id', 'tipo', 'titulo-es']);
    expect(rows).toEqual([{ id: 'C1', tipo: 'nave', 'titulo-es': 'Hola' }]);
    expect(errors).toEqual([]);
  });

  it('detecta «;» sin confundirse con los «|» de atributos', () => {
    const { rows } = parseCsv('id;tipo;atributos\nC1;nave;fuerza:1|vida:2\n');
    expect(rows[0].atributos).toBe('fuerza:1|vida:2');
  });

  it('avisa de columnas obligatorias e ids repetidos', () => {
    const { errors } = parseCsv('id,titulo\nA,x\nA,y\n');
    expect(errors).toContain('El CSV no tiene columna «tipo».');
    expect(errors).toContain('id repetido: «A»');
  });

  it('ignora filas vacías', () => {
    expect(parseCsv('id,tipo\nA,x\n,\n\n').rows).toHaveLength(1);
  });
});

describe('detectLangs', () => {
  it('deduce los idiomas de los sufijos', () => {
    expect(detectLangs(['id', 'titulo-es', 'titulo-en', 'descripcion-es', 'bloque 1'])).toEqual(['es', 'en']);
  });
});
