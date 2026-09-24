import { describe, expect, it } from 'vitest';
import { withDpi } from './dpi';

// PNG mínimo de 1×1 px (firma + IHDR + IDAT + IEND).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

describe('withDpi', () => {
  it('añade un chunk pHYs válido justo después de IHDR', async () => {
    const out = new Uint8Array(await (await withDpi(new Blob([PNG_1PX], { type: 'image/png' }), 300)).arrayBuffer());
    const view = new DataView(out.buffer);
    const at = 33;
    expect(String.fromCharCode(...out.subarray(at + 4, at + 8))).toBe('pHYs');
    expect(view.getUint32(at + 8)).toBe(11811); // 300 ppp en píxeles por metro
    expect(out[at + 16]).toBe(1);
    expect(view.getUint32(at + 17)).toBe(crc32(out.subarray(at + 4, at + 17)));
    expect(out.length).toBe(PNG_1PX.length + 21);
  });

  it('escribe los ppp en la cabecera JFIF', async () => {
    const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    const out = new Uint8Array(await (await withDpi(new Blob([jfif], { type: 'image/jpeg' }), 300)).arrayBuffer());
    const view = new DataView(out.buffer);
    expect(out[13]).toBe(1);
    expect(view.getUint16(14)).toBe(300);
    expect(view.getUint16(16)).toBe(300);
  });
});
