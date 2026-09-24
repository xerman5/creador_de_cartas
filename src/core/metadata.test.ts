import { describe, expect, it } from 'vitest';
import { withMetadata } from './metadata';

// PNG mínimo de 1×1 px (firma + IHDR + IDAT + IEND).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
const JFIF = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const EOI = [0xff, 0xda, 0, 2, 0xff, 0xd9];

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function run(bytes: number[] | Uint8Array, type: string, dpi = 300) {
  return new Uint8Array(await (await withMetadata(new Blob([new Uint8Array(bytes)], { type }), dpi)).arrayBuffer());
}

/** Bloques del PNG en orden, comprobando el CRC de cada uno. */
function pngChunks(png: Uint8Array) {
  const view = new DataView(png.buffer);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let i = 8; i < png.length; ) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    expect(view.getUint32(i + 8 + len), `CRC de ${type}`).toBe(crc32(png.subarray(i + 4, i + 8 + len)));
    out.push({ type, data: png.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  return out;
}

/** Segmentos del JPEG hasta el inicio de la imagen. */
function jpgSegments(jpg: Uint8Array) {
  const out: { marker: number; body: Uint8Array }[] = [];
  for (let i = 2; jpg[i] === 0xff; ) {
    const marker = jpg[i + 1];
    const len = (jpg[i + 2] << 8) | jpg[i + 3];
    out.push({ marker, body: jpg.subarray(i + 4, i + 2 + len) });
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return out;
}

describe('withMetadata · PNG', () => {
  it('añade ppp y sRGB tras IHDR, con CRC válidos', async () => {
    const chunks = pngChunks(await run(PNG_1PX, 'image/png'));
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'sRGB', 'gAMA', 'cHRM', 'IDAT', 'IEND']);
    const phys = new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset);
    expect(phys.getUint32(0)).toBe(11811); // 300 ppp en píxeles por metro
    expect(chunks[1].data[8]).toBe(1);
    expect(chunks[2].data).toEqual(new Uint8Array([0]));
    expect(new DataView(chunks[3].data.buffer, chunks[3].data.byteOffset).getUint32(0)).toBe(45455);
    expect(chunks[4].data.length).toBe(32);
  });

  it('no añade sRGB si la imagen ya trae perfil', async () => {
    const body = [...'iCCP'].map((c) => c.charCodeAt(0)).concat([0x70, 0, 0, 1, 2, 3]);
    const iccp = new Uint8Array(12 + body.length - 4);
    const view = new DataView(iccp.buffer);
    view.setUint32(0, body.length - 4);
    iccp.set(body, 4);
    view.setUint32(8 + body.length - 4, crc32(iccp.subarray(4, 4 + body.length)));
    const input = new Uint8Array([...PNG_1PX.subarray(0, 33), ...iccp, ...PNG_1PX.subarray(33)]);
    const types = pngChunks(await run(input, 'image/png')).map((c) => c.type);
    expect(types).toEqual(['IHDR', 'pHYs', 'iCCP', 'IDAT', 'IEND']);
  });
});

describe('withMetadata · JPG', () => {
  it('escribe los ppp en la cabecera JFIF', async () => {
    const out = await run([...JFIF, ...EOI], 'image/jpeg');
    const view = new DataView(out.buffer);
    expect(out[13]).toBe(1);
    expect(view.getUint16(14)).toBe(300);
    expect(view.getUint16(16)).toBe(300);
  });

  it('incrusta el perfil sRGB justo después de JFIF si no hay ninguno', async () => {
    const segs = jpgSegments(await run([...JFIF, ...EOI], 'image/jpeg'));
    expect(segs.map((s) => s.marker)).toEqual([0xe0, 0xe2, 0xda]);
    const icc = segs[1].body;
    expect(String.fromCharCode(...icc.subarray(0, 11))).toBe('ICC_PROFILE');
    expect([icc[12], icc[13]]).toEqual([1, 1]);
    const profile = icc.subarray(14);
    expect(new DataView(profile.buffer, profile.byteOffset).getUint32(0)).toBe(profile.length);
    expect(String.fromCharCode(...profile.subarray(36, 40))).toBe('acsp');
    expect(String.fromCharCode(...profile.subarray(16, 20))).toBe('RGB ');
  });

  it('no duplica el perfil si el navegador ya lo incrustó', async () => {
    const once = await run([...JFIF, ...EOI], 'image/jpeg');
    const twice = await run(once, 'image/jpeg');
    expect(jpgSegments(twice).filter((s) => s.marker === 0xe2)).toHaveLength(1);
  });

  it('crea la cabecera JFIF si falta', async () => {
    const segs = jpgSegments(await run([0xff, 0xd8, ...EOI], 'image/jpeg', 600));
    expect(segs.map((s) => s.marker)).toEqual([0xe0, 0xe2, 0xda]);
    expect(new DataView(segs[0].body.buffer, segs[0].body.byteOffset).getUint16(8)).toBe(600);
  });
});
