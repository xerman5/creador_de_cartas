import { describe, expect, it } from 'vitest';
import { defaultAnswers, type TypeAnswer } from '../../core/wizard/answers';
import { buildProject } from '../../core/wizard/build';
import { clearOwn, fineFor, hasOwn, tourElements } from './tour';

function answers() {
  const a = defaultAnswers();
  a.types = [
    { label: 'Criatura', count: 2, elements: ['art', 'rules', 'cost', 'stats'], attributes: ['ataque'] },
    { label: 'Hechizo', count: 2, elements: ['rules'], attributes: [] },
  ];
  return a;
}

describe('recorrido tipo a tipo', () => {
  it('solo los elementos que tiene cada plantilla, siempre empezando por el fondo', () => {
    const { project } = buildProject(answers());
    expect(tourElements(project.templates.criatura.zones).map((e) => e.id)).toEqual(['fondo', 'ilustracion', 'titulo', 'reglas', 'atributos', 'coste']);
    expect(tourElements(project.templates.hechizo.zones).map((e) => e.id)).toEqual(['fondo', 'titulo', 'reglas']);
    expect(tourElements([])).toEqual([]);
  });

  it('escribe en el ajuste de todos o en el del tipo, y sabe quitar los del tipo', () => {
    const a = answers();
    const t: TypeAnswer = a.types[0];
    expect(fineFor(a, t, 'all')).toBe(a.fine);
    const own = fineFor(a, t, 'type');
    expect(t.fine).toBe(own);
    const titulo = tourElements(buildProject(a).project.templates.criatura.zones).find((e) => e.id === 'titulo')!;
    const fondo = tourElements(buildProject(a).project.templates.criatura.zones).find((e) => e.id === 'fondo')!;
    expect(hasOwn(t, titulo)).toBe(false);
    own.texts = { titulo: { align: 'left' } };
    own.pieces = { cabecera: { fill: 'none' } };
    own.images = { frame: '' };
    expect(hasOwn(t, titulo)).toBe(true);
    expect(hasOwn(t, fondo)).toBe(true);
    clearOwn(t, titulo);
    expect(hasOwn(t, titulo)).toBe(false);
    expect(hasOwn(t, fondo)).toBe(true);
    clearOwn(t, fondo);
    expect(hasOwn(t, fondo)).toBe(false);
  });
});
