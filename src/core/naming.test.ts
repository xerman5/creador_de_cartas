import { describe, expect, it } from 'vitest';
import { compactKey, conventionalId, conventionalName, isGenericName, nearest, parseNumbered, singular, titleFromFile, typeMatchKey } from './naming';

describe('convención de nombres: clase, tipo y número', () => {
  it('singular de los nombres de tipos', () => {
    const pairs: [string, string][] = [
      ['elfos', 'elfo'],
      ['recursos', 'recurso'],
      ['lugares', 'lugar'],
      ['ataques', 'ataque'],
      ['dragones', 'dragon'],
      ['luces', 'luz'],
      ['reyes', 'rey'],
      ['lugar', 'lugar'],
      ['de', 'de'],
      ['clase', 'clase'],
    ];
    for (const [plural, one] of pairs) expect(singular(plural), plural).toBe(one);
  });

  it('lee palabras, número y referencia con cualquier separador', () => {
    expect(parseNumbered('elfos-ataque-001.png')).toEqual({ words: ['elfo', 'ataque'], key: 'elfoataque', n: 1, ref: false });
    expect(parseNumbered('elfos-recursos-001(ref).png')).toEqual({ words: ['elfo', 'recurso'], key: 'elforecurso', n: 1, ref: true });
    expect(parseNumbered('Elfos_Lugares 12 ref.jpg')).toMatchObject({ words: ['Elfo', 'Lugar'], n: 12, ref: true });
    expect(parseNumbered('lugar001.png')).toMatchObject({ words: ['lugar'], n: 1, ref: false });
    expect(parseNumbered('CartaDeEvento-3.webp')).toMatchObject({ words: ['Carta', 'De', 'Evento'], key: 'cartadeevento', n: 3 });
    for (const name of ['portada.png', '001.png', 'lugar0.png', 'ref.png']) expect(parseNumbered(name), name).toBeNull();
  });

  it('un tipo (con o sin clase) encaja con los nombres de archivo aunque estén en plural', () => {
    expect(typeMatchKey('Elfo', 'Ataque')).toBe(parseNumbered('elfos-ataques-7.png')!.key);
    expect(typeMatchKey(undefined, 'Carta de evento')).toBe(parseNumbered('cartas-de-evento-3.png')!.key);
    expect(typeMatchKey('Lugar')).toBe('lugar');
  });

  it('ids y nombres de archivo con la convención', () => {
    expect(conventionalId('Lugar', 1)).toBe('lugar-001');
    expect(conventionalId(['Elfo', 'Ataque'], 12)).toBe('elfo-ataque-012');
    expect(conventionalId([undefined, 'Carta de evento'], 3)).toBe('carta-de-evento-003');
    expect(conventionalName('carpeta/Elfos-Lugares7.PNG', ['Elfo', 'Lugar'], 7)).toBe('carpeta/elfo-lugar-007.png');
    expect(conventionalName('x.png', ['Elfo', 'Lugar'], 1, true)).toBe('elfo-lugar-001(ref).png');
    expect(compactKey('Carta de évento')).toBe('cartadeevento');
  });

  it('los nombres genéricos (cámaras, capturas) no son de ningún tipo ni dan título', () => {
    for (const name of ['IMG_2041.jpg', 'DSC00012.JPG', 'Captura de pantalla 2024-03-01 a las 10.12.33.png', 'PXL_20240101_123456.jpg', '0003.png'])
      expect(parseNumbered(name), name).toBeNull();
    expect(isGenericName('IMG_2041.jpg')).toBe(true);
    expect(isGenericName('dragon rojo.png')).toBe(false);
    expect(titleFromFile('bocetos/guardian-de-ceniza.jpg')).toBe('Guardian de ceniza');
    expect(titleFromFile('DragonRojo.png')).toBe('Dragon Rojo');
    expect(titleFromFile('TORRE_OSCURA.webp')).toBe('Torre oscura');
    expect(titleFromFile('IMG_2041.jpg')).toBe('');
  });

  it('sugiere el nombre que se quería decir', () => {
    const opts = [
      { key: 'enemigo', value: 'Enemigo' },
      { key: 'lugar', value: 'Lugar' },
    ];
    expect(nearest('enemgo', opts)).toBe('Enemigo');
    expect(nearest('aliado', opts)).toBeUndefined();
    expect(nearest('lugar', opts)).toBeUndefined();
  });
});
