import { describe, expect, it } from 'vitest';
import { MemorySource } from './assets';
import { pendingItems } from './pending';
import { loadProject } from './project';
import { defaultAnswers, type WizardAnswers } from './wizard/answers';
import { buildProject, projectFiles } from './wizard/build';

async function load(a: WizardAnswers, edit?: (files: Record<string, string>) => void) {
  const files = projectFiles(buildProject(a));
  edit?.(files);
  return loadProject(new MemorySource('m', files));
}

const answers = (): WizardAnswers => ({
  ...defaultAnswers(),
  langs: ['es', 'en'],
  types: [{ label: 'Criatura', count: 3, elements: ['art', 'rules', 'flavor', 'stats'], attributes: ['ataque'] }],
});

describe('pendingItems', () => {
  it('un proyecto recién creado lo tiene todo pendiente', async () => {
    const items = pendingItems(await load(answers()));
    expect(items.map((i) => [i.id, i.count])).toEqual([
      ['art', 3],
      ['titles', 3],
      ['rules', 3],
      ['flavor', 3],
      ['icons', 2],
      ['back', 1],
    ]);
    expect(items[0].rows).toEqual([0, 1, 2]);
    expect(items.find((i) => i.id === 'back')!.rows).toEqual([3]);
  });

  it('lo que el usuario rellena deja de estar pendiente', async () => {
    const lp = await load(answers(), (f) => {
      f['cartas.csv'] = f['cartas.csv']
        .replace('Criatura 1,Criatura 1', 'Dragón,Dragon')
        .replace(/Escribe aquí el texto de reglas\. \{ataque\},Write the rules text here\. \{ataque\}/, 'Vuela.,Flies.');
    });
    lp.rows[1].ilustracion = 'ilustraciones/lobo.png';
    const items = Object.fromEntries(pendingItems(lp).map((i) => [i.id, i.rows]));
    expect(items.titles).toEqual([1, 2]);
    expect(items.rules).toEqual([1, 2]);
    expect(items.art).toEqual([0, 2]);
  });

  it('un proyecto hecho a mano no tiene pendientes', async () => {
    const lp = await load(answers());
    lp.project.templates = {};
    lp.project.attributes = {};
    lp.rows.forEach((r) => {
      r['titulo-es'] = 'x';
      r['descripcion-es'] = r['descripcion-en'] = 'y';
      r['sabor-es'] = r['sabor-en'] = 'z';
    });
    expect(pendingItems(lp)).toEqual([]);
  });
});
