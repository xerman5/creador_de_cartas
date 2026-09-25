import { describe, expect, it } from 'vitest';
import { detectLangs, parseCsv, serializeCsv } from './csv';

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

describe('serializeCsv', () => {
  it('vuelve a escribir el archivo con sus cabeceras, separador, saltos y BOM', () => {
    const text = '﻿Id;Tipo;Título-ES\r\nA1;carta;Hola; mundo\r\n';
    const fixed = '﻿Id;Tipo;Título-ES\r\nA1;carta;"Hola; mundo"\r\n';
    const csv = parseCsv(fixed);
    expect(csv.format).toEqual({ delimiter: ';', headers: ['Id', 'Tipo', 'Título-ES'], newline: '\r\n', bom: true });
    expect(serializeCsv(csv.rows, csv.columns, csv.format)).toBe(fixed);
    // Una columna nueva usa su clave como cabecera.
    const rows = csv.rows.map((r) => ({ ...r, notas: 'x' }));
    expect(serializeCsv(rows, [...csv.columns, 'notas'], csv.format)).toBe('﻿Id;Tipo;Título-ES;notas\r\nA1;carta;"Hola; mundo";x\r\n');
    expect(parseCsv(text).rows[0]['titulo-es']).toBe('Hola');
  });
});
