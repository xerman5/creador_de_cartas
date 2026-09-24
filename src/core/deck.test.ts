import { describe, expect, it } from 'vitest';
import { backRef, copiesOf, planExport } from './deck';
import { buildManifest, exportSettings, fileNames } from './export';
import type { CardRow, Project } from './types';

const project: Project = {
  name: 'Prueba',
  csv: 'cartas.csv',
  assetsDir: 'assets',
  card: { width: 63, height: 88, safe: 3 },
  fonts: [],
  attributes: {},
  templates: {
    nave: { zones: [], back: 'D01' },
    enemigo: { zones: [] },
    dorso: { zones: [] },
    grande: { zones: [], size: { width: 70, height: 120 } },
  },
};

const rows: CardRow[] = [
  { id: 'N01', tipo: 'nave', trasera: '', copias: '' },
  { id: 'N02', tipo: 'Nave', trasera: 'D02', copias: '3' },
  { id: 'N03', tipo: 'nave', trasera: '-', copias: '0' },
  { id: 'E01', tipo: 'enemigo', trasera: 'D02', copias: 'dos' },
  { id: 'E02', tipo: 'enemigo', trasera: 'X99', copias: '' },
  { id: 'D01', tipo: 'dorso', trasera: '', copias: '' },
  { id: 'D02', tipo: 'dorso', trasera: '', copias: '' },
  { id: 'G01', tipo: 'grande', trasera: '', copias: '' },
];
const all = rows.map((_, i) => i);

describe('backRef', () => {
  it('la columna manda; vacía usa la plantilla; «-» anula', () => {
    expect(backRef(rows[0], project)).toBe('D01');
    expect(backRef(rows[1], project)).toBe('D02');
    expect(backRef(rows[2], project)).toBe('');
    expect(backRef(rows[7], project)).toBe('');
  });
});

describe('copiesOf', () => {
  it('vacía = 1, entero ≥ 0, y avisa si no es número', () => {
    expect(copiesOf({ copias: '' })).toEqual({ copies: 1 });
    expect(copiesOf({ copias: ' 4 ' })).toEqual({ copies: 4 });
    expect(copiesOf({ copias: '0' })).toEqual({ copies: 0 });
    expect(copiesOf({ copias: '1.5' }).warning).toMatch(/no es un número entero/);
  });
});

describe('planExport', () => {
  const plan = planExport(rows, all, project);

  it('las cartas usadas solo como trasera no son cartas; 0 copias no se exporta', () => {
    expect(plan.fronts).toEqual([
      { index: 0, copies: 1, back: 5 },
      { index: 1, copies: 3, back: 6 },
      { index: 3, copies: 1, back: 6 },
      { index: 4, copies: 1, back: null },
      { index: 7, copies: 1, back: null },
    ]);
    expect(plan.backs).toEqual([5, 6]);
  });

  it('avisa de traseras inexistentes y copias no válidas', () => {
    expect(plan.warnings).toEqual([
      { index: 3, message: '«copias» no es un número entero: «dos»' },
      { index: 4, message: 'la trasera «X99» no existe en el CSV' },
    ]);
  });

  it('al filtrar, las traseras referenciadas se incluyen igualmente', () => {
    const p = planExport(rows, [3], project);
    expect(p.fronts.map((f) => f.index)).toEqual([3]);
    expect(p.backs).toEqual([6]);
  });

  it('exportar solo traseras las genera como traseras', () => {
    const p = planExport(rows, [5, 6], project);
    expect(p.fronts).toEqual([]);
    expect(p.backs).toEqual([5, 6]);
  });
});

describe('fileNames', () => {
  it('desambigua ids que dan el mismo nombre', () => {
    const r: CardRow[] = [{ id: 'a b' }, { id: 'a_b' }, { id: 'N-5' }, { id: '' }];
    const names = fileNames([0, 1, 2, 3], r, { format: 'png', lang: 'es', langSuffix: false });
    expect([...names.values()]).toEqual(['a_b.png', 'a_b-2.png', 'N-5.png', 'fila4.png']);
  });

  it('añade el idioma si se pide', () => {
    expect(fileNames([0], rows, { format: 'jpg', lang: 'en', langSuffix: true }).get(0)).toBe('N01_en.jpg');
  });
});

describe('buildManifest', () => {
  const plan = planExport(rows, all, project);
  const opts = { dpi: 300, lang: 'es', format: 'png' as const, quality: 0.95, langSuffix: false };
  const names = fileNames([...plan.fronts.map((f) => f.index), ...plan.backs], rows, opts);
  const m = buildManifest(plan, rows, project, opts, names, '2026-01-01T00:00:00.000Z');

  it('enlaza anverso, trasera y copias', () => {
    expect(m.cards[1]).toEqual({ id: 'N02', tipo: 'nave', copies: 3, front: 'N02.png', back: 'D02.png' });
    expect(m.cards[3].back).toBeNull();
    expect(m.bleedMm).toBe(3);
    expect(m.provisional).toBe(true);
  });

  it('describe cada imagen una vez, con su tamaño exacto', () => {
    expect(Object.keys(m.images)).toEqual(['N01.png', 'N02.png', 'E01.png', 'E02.png', 'G01.png', 'D01.png', 'D02.png']);
    expect(m.images['N01.png'].px).toEqual({ trimWidth: 744, trimHeight: 1039, bleed: 35, width: 814, height: 1109 });
    expect(m.images['G01.png'].trimMm).toEqual({ width: 70, height: 120 });
  });
});

describe('exportSettings', () => {
  it('rellena valores por defecto y corrige los que salen de rango', () => {
    expect(exportSettings(project)).toEqual({ dpi: 300, format: 'png', quality: 95 });
    expect(exportSettings({ ...project, export: { dpi: 299.6, format: 'jpg', quality: 20 } })).toEqual({ dpi: 300, format: 'jpg', quality: 50 });
    expect(exportSettings({ ...project, export: { dpi: 5000, format: 'gif' as 'png' } })).toEqual({ dpi: 1200, format: 'png', quality: 95 });
  });
});
