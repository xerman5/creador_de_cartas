import { describe, expect, it } from 'vitest';
import { decodeResources, encodeResources, matchByName, resourcePath, shelfOf, stem } from './resources';

describe('recursos', () => {
  it('rutas limpias y sin pisar otras', () => {
    const taken = new Set(['iconos/volar.png']);
    expect(resourcePath('iconos', 'Volar.PNG', (p) => taken.has(p))).toBe('iconos/volar-2.png');
    expect(resourcePath('fondos', 'Fondo Ñandú.jpeg', () => false)).toBe('fondos/fondo-nandu.jpg');
    expect(resourcePath('iconos', 'C:\\x\\Escudo.svg', () => false)).toBe('iconos/escudo.svg');
    expect(shelfOf('iconos/a.png')).toBe('iconos');
    expect(shelfOf('provisional/a.svg')).toBeNull();
    expect(stem('iconos/volar-2.png')).toBe('volar-2');
  });

  it('empareja por nombre sin mayúsculas, tildes ni separadores', () => {
    const files = [{ name: 'VOLAR.png' }, { name: 'daño_extra.svg' }, { name: 'notas.txt' }, { name: 'volar.svg' }];
    const m = matchByName(files, ['Volar', 'Daño extra', 'Notas', 'Vida']);
    expect(m.get('Volar')?.name).toBe('VOLAR.png');
    expect(m.get('Daño extra')?.name).toBe('daño_extra.svg');
    expect(m.has('Notas')).toBe(false);
    expect(m.has('Vida')).toBe(false);
  });

  it('ida y vuelta por el archivo de progreso', async () => {
    const res = new Map<string, Blob>([
      ['iconos/volar.svg', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' })],
      ['fondos/f.png', new Blob([new Uint8Array([137, 80, 78, 71, 0, 255])], { type: 'image/png' })],
    ]);
    const back = decodeResources(JSON.parse(JSON.stringify(await encodeResources(res))));
    expect([...back.keys()]).toEqual(['iconos/volar.svg', 'fondos/f.png']);
    expect(await back.get('iconos/volar.svg')!.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect([...new Uint8Array(await back.get('fondos/f.png')!.arrayBuffer())]).toEqual([137, 80, 78, 71, 0, 255]);
    expect(back.get('fondos/f.png')!.type).toBe('image/png');
    expect(decodeResources({ '../x.png': 'data:,a', 'otros/y.png': 'data:,a', 'iconos/z.png': 5 }).size).toBe(0);
  });
});
