import { describe, expect, it } from 'vitest';
import { compactKey, conventionalId, conventionalName, nearestLabel, parseNumbered } from './naming';

describe('convención de nombres tipo + número', () => {
  it('lee el tipo y el número con cualquier separador, mayúsculas, tildes y ceros', () => {
    for (const name of ['lugar001.png', 'Lugar-1.jpg', 'LUGAR_01.webp', 'imgs/lugar 1.png', 'lugar.001.png'])
      expect(parseNumbered(name), name).toMatchObject({ base: 'lugar', n: 1 });
    expect(parseNumbered('carta_de_evento 03.png')).toEqual({ base: 'cartadeevento', n: 3, label: 'Carta de evento' });
    expect(parseNumbered('CartaDeEvento12.png')).toMatchObject({ base: 'cartadeevento', n: 12, label: 'Carta de evento' });
    expect(parseNumbered('Dragón-7.png')).toMatchObject({ base: 'dragon', label: 'Dragón' });
    for (const name of ['portada.png', '001.png', 'lugar0.png', '3lugar5.png']) expect(parseNumbered(name), name).toBeNull();
  });

  it('ids y nombres de archivo con la convención', () => {
    expect(conventionalId('Lugar', 1)).toBe('lugar001');
    expect(conventionalId('Carta de evento', 12)).toBe('carta-de-evento012');
    expect(conventionalName('carpeta/Lugares7.PNG', 'Lugar', 7)).toBe('carpeta/lugar007.png');
    expect(compactKey('Carta de évento')).toBe('cartadeevento');
  });

  it('sugiere el tipo que se quería decir', () => {
    expect(nearestLabel('lugares', ['Lugar', 'Evento'])).toBe('Lugar');
    expect(nearestLabel('enemgo', ['Enemigo', 'Lugar'])).toBe('Enemigo');
    expect(nearestLabel('aliado', ['Lugar', 'Evento'])).toBeUndefined();
    expect(nearestLabel('mar', ['Mal'])).toBe('Mal');
  });
});
