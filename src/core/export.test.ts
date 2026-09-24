import { describe, expect, it } from 'vitest';
import type { FileSource } from './assets';
import { saveToFolder, type ExportFile } from './export';

class MemorySource implements FileSource {
  label = 'memoria';
  files = new Map<string, Blob | string>();
  async read(path: string) {
    const v = this.files.get(path);
    return v === undefined ? null : new Blob([v]);
  }
  async write(path: string, data: Blob | string) {
    this.files.set(path, data);
  }
  async remove(path: string) {
    this.files.delete(path);
  }
}

async function* files(names: string[], images: string[]): AsyncGenerator<ExportFile> {
  for (const name of names) yield { name, input: `imagen ${name}` };
  yield { name: 'manifest.json', input: JSON.stringify({ images: Object.fromEntries(images.map((n) => [n, {}])) }) };
}

describe('saveToFolder', () => {
  it('escribe cada archivo y el manifiesto en la carpeta', async () => {
    const src = new MemorySource();
    await saveToFolder(files(['A.png', 'B.png'], ['A.png', 'B.png']), src, 'export');
    expect([...src.files.keys()].sort()).toEqual(['export/A.png', 'export/B.png', 'export/manifest.json']);
  });

  it('borra solo lo que declaraba el manifiesto anterior y ya no se genera', async () => {
    const src = new MemorySource();
    await saveToFolder(files(['A.png', 'B.png'], ['A.png', 'B.png']), src, 'export');
    src.files.set('export/notas.txt', 'del usuario');
    await saveToFolder(files(['A.png'], ['A.png']), src, 'export');
    expect([...src.files.keys()].sort()).toEqual(['export/A.png', 'export/manifest.json', 'export/notas.txt']);
  });

  it('ignora nombres con rutas en un manifiesto manipulado', async () => {
    const src = new MemorySource();
    src.files.set('proyecto.json', '{}');
    src.files.set('export/manifest.json', JSON.stringify({ images: { '../proyecto.json': {}, 'X.png': {} } }));
    src.files.set('export/X.png', 'vieja');
    await saveToFolder(files([], []), src, 'export');
    expect(src.files.has('proyecto.json')).toBe(true);
    expect(src.files.has('export/X.png')).toBe(false);
  });

  it('se detiene al cancelar', async () => {
    const src = new MemorySource();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(saveToFolder(files(['A.png'], ['A.png']), src, 'export', ctrl.signal)).rejects.toThrow();
    expect(src.files.size).toBe(0);
  });
});
