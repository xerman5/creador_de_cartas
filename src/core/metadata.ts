// Metadatos de PNG y JPG: resolución (ppp) para que el software de maquetación interprete
// el tamaño físico correcto (p. ej. 69×94 mm a 300 ppp) y espacio de color sRGB, que es
// en el que dibuja el canvas, para que nadie tenga que adivinarlo.

/** Perfil sRGB v2 compacto (456 bytes), CC0: github.com/saucecontrol/Compact-ICC-Profiles */
const SRGB_ICC = Uint8Array.from(
  atob('AAAByGxjbXMCEAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5knZEAPUCAsD1AdCyBnqUijgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAABfY3BydAAAAQwAAAAMd3RwdAAAARgAAAAUclhZWgAAASwAAAAUZ1hZWgAAAUAAAAAUYlhZWgAAAVQAAAAUclRSQwAAAWgAAABgZ1RSQwAAAWgAAABgYlRSQwAAAWgAAABgZGVzYwAAAAAAAAAFdVJHQgAAAAAAAAAAAAAAAHRleHQAAAAAQ0MwAFhZWiAAAAAAAADzVAABAAAAARbJWFlaIAAAAAAAAG+gAAA48gAAA49YWVogAAAAAAAAYpYAALeJAAAY2lhZWiAAAAAAAAAkoAAAD4UAALbEY3VydgAAAAAAAAAqAAAAfAD4AZwCdQODBMkGTggSChgMYg70Ec8U9hhqHC4gQySsKWoufjPrObM/1kZXTTZUdlwXZB1shnVWfo2ILJI2nKunjLLbvpnKx9dl5Hfx+f//'),
  (c) => c.charCodeAt(0),
);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

function pngChunkTypes(src: Uint8Array): Set<string> {
  const types = new Set<string>();
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  for (let i = 8; i + 8 <= src.length; ) {
    const type = String.fromCharCode(...src.subarray(i + 4, i + 8));
    types.add(type);
    if (type === 'IDAT') break;
    i += 12 + view.getUint32(i);
  }
  return types;
}

/** pHYs con los ppp y, si no trae perfil propio, sRGB + gAMA + cHRM (los valores que fija la norma PNG para sRGB). */
function pngWithMetadata(src: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const existing = pngChunkTypes(src);
  const chunks = [pngChunk('pHYs', [...u32(ppm), ...u32(ppm), 1])]; // unidad: metro
  if (!existing.has('iCCP') && !existing.has('sRGB')) {
    chunks.push(
      pngChunk('sRGB', [0]), // intención perceptual
      pngChunk('gAMA', u32(45455)),
      pngChunk('cHRM', [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000].flatMap(u32)),
    );
  }
  const extra = chunks.reduce((n, c) => n + c.length, 0);
  const afterIhdr = 8 + 25; // firma + chunk IHDR
  const out = new Uint8Array(src.length + extra);
  out.set(src.subarray(0, afterIhdr), 0);
  let at = afterIhdr;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  out.set(src.subarray(afterIhdr), at);
  return out;
}

/** ¿Hay un segmento APP2 «ICC_PROFILE» antes de los datos de imagen? */
function jpgHasIcc(src: Uint8Array): boolean {
  for (let i = 2; i + 4 <= src.length && src[i] === 0xff; ) {
    const marker = src[i + 1];
    if (marker === 0xda) break; // empieza la imagen
    const len = (src[i + 2] << 8) | src[i + 3];
    if (marker === 0xe2 && String.fromCharCode(...src.subarray(i + 4, i + 15)) === 'ICC_PROFILE') return true;
    i += 2 + len;
  }
  return false;
}

/** Ppp en la cabecera JFIF y, si el navegador no incrustó perfil (Chrome sí lo hace), el perfil sRGB. */
function jpgWithMetadata(src: Uint8Array, dpi: number): Uint8Array {
  let out: Uint8Array;
  const isJfif = src[2] === 0xff && src[3] === 0xe0 && String.fromCharCode(...src.subarray(6, 10)) === 'JFIF';
  if (isJfif) {
    out = src.slice();
    const view = new DataView(out.buffer);
    out[13] = 1; // unidad: pulgada
    view.setUint16(14, dpi);
    view.setUint16(16, dpi);
  } else {
    const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0, 0]);
    out = new Uint8Array(src.length + app0.length);
    out.set(src.subarray(0, 2), 0);
    out.set(app0, 2);
    out.set(src.subarray(2), 2 + app0.length);
  }
  if (jpgHasIcc(out)) return out;

  const afterApp0 = 4 + ((out[4] << 8) | out[5]);
  const len = 2 + 14 + SRGB_ICC.length;
  const app2 = new Uint8Array(2 + len);
  app2.set([0xff, 0xe2, len >> 8, len & 0xff], 0);
  for (let i = 0; i < 12; i++) app2[4 + i] = 'ICC_PROFILE\0'.charCodeAt(i);
  app2[16] = 1; // fragmento 1…
  app2[17] = 1; // …de 1
  app2.set(SRGB_ICC, 18);
  const res = new Uint8Array(out.length + app2.length);
  res.set(out.subarray(0, afterApp0), 0);
  res.set(app2, afterApp0);
  res.set(out.subarray(afterApp0), afterApp0 + app2.length);
  return res;
}

export async function withMetadata(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = blob.type === 'image/png' ? pngWithMetadata(bytes, dpi) : jpgWithMetadata(bytes, Math.round(dpi));
  return new Blob([out as BlobPart], { type: blob.type });
}
