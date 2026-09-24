// Escribe la resolución (ppp) en los metadatos de PNG y JPG para que el software
// de maquetación interprete el tamaño físico correcto (p. ej. 69×94 mm a 300 ppp).

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

function pngWithDpi(src: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unidad: metro
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const afterIhdr = 8 + 25; // firma + chunk IHDR
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, afterIhdr), 0);
  out.set(chunk, afterIhdr);
  out.set(src.subarray(afterIhdr), afterIhdr + chunk.length);
  return out;
}

function jpgWithDpi(src: Uint8Array, dpi: number): Uint8Array {
  const isJfif = src[2] === 0xff && src[3] === 0xe0 && String.fromCharCode(...src.subarray(6, 10)) === 'JFIF';
  if (isJfif) {
    const out = src.slice();
    const view = new DataView(out.buffer);
    out[13] = 1; // unidad: pulgada
    view.setUint16(14, dpi);
    view.setUint16(16, dpi);
    return out;
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0, 0]);
  const out = new Uint8Array(src.length + app0.length);
  out.set(src.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(src.subarray(2), 2 + app0.length);
  return out;
}

export async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = blob.type === 'image/png' ? pngWithDpi(bytes, dpi) : jpgWithDpi(bytes, Math.round(dpi));
  return new Blob([out as BlobPart], { type: blob.type });
}
