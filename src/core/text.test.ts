import { describe, expect, it } from 'vitest';
import { getField, normalizeKey, readText } from './text';

describe('normalizeKey', () => {
  it('ignora tildes, mayúsculas y espacios sobrantes', () => {
    expect(normalizeKey('  Descripción-ES ')).toBe('descripcion-es');
    expect(normalizeKey('Bloque   1')).toBe('bloque 1');
    expect(normalizeKey('Localización')).toBe('localizacion');
  });
});

describe('getField', () => {
  const row = { titulo: 'genérico', 'titulo-es': ' Hola ', 'titulo-en': 'Hello', vida: '3' };

  it('prefiere la columna del idioma', () => {
    expect(getField(row, 'Título', 'es')).toBe('Hola');
    expect(getField(row, 'titulo', 'en')).toBe('Hello');
  });

  it('cae a la columna genérica si no existe la del idioma', () => {
    expect(getField(row, 'titulo', 'fr')).toBe('genérico');
    expect(getField(row, 'vida', 'es')).toBe('3');
  });

  it('devuelve vacío si no hay columna', () => {
    expect(getField(row, 'nada', 'es')).toBe('');
  });
});

describe('readText', () => {
  it('lee UTF-8', async () => {
    expect(await readText(new Blob(['año'], { type: 'text/plain' }))).toBe('año');
  });

  it('cae a Windows-1252 (CSV de Excel)', async () => {
    const latin1 = new Uint8Array([0x61, 0xf1, 0x6f]); // "año"
    expect(await readText(new Blob([latin1]))).toBe('año');
  });
});
