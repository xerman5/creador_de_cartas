import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { defaultAnswers, type WizardAnswers } from './answers';
import { buildProject } from './build';
import { applyAll, applyProject, fingerprint, handEdited, hash, mergeCsv, newWizardFile, parseWizardFile, resumeAnswers, stableStringify } from './sync';

function game(): WizardAnswers {
  const a = defaultAnswers();
  a.name = 'Bestias';
  a.types = [
    { label: 'Criatura', count: 2, elements: ['art', 'rules', 'stats'], attributes: ['ataque', 'vida'] },
    { label: 'Hechizo', count: 1, elements: ['rules'], attributes: [] },
  ];
  return a;
}

/** Proyecto recién creado con el asistente: lo que hay en la carpeta. */
function created(a = game()) {
  const built = buildProject(a);
  const file = parseWizardFile(newWizardFile(built, a, 'crear'));
  return { built, file, project: structuredClone(built.project), csv: built.csv };
}

const rows = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, delimiter: ',', skipEmptyLines: true }).data;

describe('huellas', () => {
  it('el mismo contenido da la misma huella aunque cambie el orden de las claves', () => {
    expect(stableStringify({ b: 1, a: { d: [1, undefined], c: undefined } })).toBe('{"a":{"d":[1,null]},"b":1}');
    expect(hash(stableStringify({ a: 1, b: 2 }))).toBe(hash(stableStringify({ b: 2, a: 1 })));
    expect(hash('a')).not.toBe(hash('b'));
  });
});

describe('retomar el asistente', () => {
  it('sin cambios fuera, las respuestas son las guardadas', () => {
    const { file, project, csv } = created();
    const { answers, notes } = resumeAnswers(file, project, csv);
    expect(notes).toEqual([]);
    expect(answers.types.map((t) => t.label)).toEqual(['Criatura', 'Hechizo']);
  });

  it('trae lo cambiado en el editor y en Excel: nombre, tamaño, iconos, colores y cartas', () => {
    const { file, project, csv } = created();
    project.name = 'Bestias II';
    project.card = { ...project.card, width: 70, height: 120 };
    project.attributes.ataque.icon = 'iconos/espada.png';
    project.colors = { ...project.colors, principal: '#112233' };
    // En Excel: la primera carta con título y ataque propios; con «\r\n», como guarda Excel.
    const edited = csv.replace('Criatura 1', 'Lobo').replace(/ataque:\d/, 'ataque:9').replace(/\n/g, '\r\n');
    const { answers, notes } = resumeAnswers(file, project, edited);
    expect(answers.name).toBe('Bestias II');
    expect(answers.size).toEqual({ width: 70, height: 120 });
    expect(answers.attributes[0].icon).toBe('iconos/espada.png');
    expect(answers.adjust.palette.principal).toBe('#112233');
    expect(answers.types[0].cards![0]).toMatchObject({ titulo: 'Lobo', 'attr:ataque': '9' });
    // La segunda carta tenía el título de relleno: no se convierte en dato.
    expect(answers.types[0].cards![1].titulo).toBeUndefined();
    expect(notes).toEqual(['el tamaño de carta', 'los iconos de Ataque', 'los colores', 'las cartas del CSV']);
  });

  it('el CSV guardado con otros saltos de línea no cuenta como cambio', () => {
    const { file, project, csv } = created();
    expect(resumeAnswers(file, project, '﻿' + csv.replace(/\n/g, '\r\n')).notes).toEqual([]);
  });
});

describe('aplicar el asistente sobre el proyecto', () => {
  it('detecta las plantillas retocadas a mano y las conserva si se pide', () => {
    const { file, project } = created();
    project.templates.criatura.zones[0].rect.x += 1;
    const a = game();
    a.adjust.palette.principal = '#000000';
    const next = buildProject(a).project;
    expect(handEdited(project, next, file.generated)).toEqual(['criatura']);
    const kept = applyProject(project, next, file.generated, new Set(['criatura']));
    expect(kept.templates.criatura).toEqual(project.templates.criatura);
    expect(kept.templates.hechizo).toEqual(next.templates.hechizo);
    const replaced = applyProject(project, next, file.generated, new Set());
    expect(replaced.templates.criatura).toEqual(next.templates.criatura);
  });

  it('conserva lo que no es del asistente y quita lo que el asistente ya no tiene', () => {
    const { file, project } = created();
    project.templates.mia = { zones: [] };
    project.attributes.suerte = { icon: 'iconos/trebol.png' };
    project.fonts = [{ family: 'Cinzel', file: 'fuentes/cinzel.ttf' }];
    project.export = { dpi: 600 };
    const a = game();
    a.types = a.types.slice(0, 1);
    a.attributes = a.attributes.slice(0, 1);
    const out = applyProject(project, buildProject(a).project, file.generated, new Set());
    expect(Object.keys(out.templates).sort()).toEqual(['criatura', 'mia', 'trasera']);
    expect(Object.keys(out.attributes).sort()).toEqual(['ataque', 'suerte']);
    expect(out.fonts).toEqual(project.fonts);
    expect(out.export).toEqual({ dpi: 600 });
  });

  it('el CSV conserva columnas propias por id y filas de tipos que no son del asistente', () => {
    const { built, csv } = created();
    const current = csv
      .replace(/^(.*)$/m, '$1,notas')
      .split('\n')
      .map((line, i) => (i === 1 ? `${line},revisar` : i > 1 && line ? `${line},` : line))
      .join('\n')
      .concat('MIA-1,mia,Carta propia,,,,,,x\n');
    const out = rows(mergeCsv(built.csv, current, ['Criatura', 'Hechizo']));
    expect(out[0]).toMatchObject({ id: 'criatura-001', notas: 'revisar' });
    expect(out.find((r) => r.id === 'MIA-1')).toMatchObject({ tipo: 'mia', titulo: 'Carta propia' });
    expect(out).toHaveLength(rows(built.csv).length + 1);
  });

  it('aplicar y volver: sin cambios de por medio, no hay retoques ni cambios que traer', () => {
    const { file, project, csv } = created();
    const a = game();
    a.types[0].cards = [{ titulo: 'Lobo' }];
    const built = buildProject(a);
    const res = applyAll({ project }, csv, built, a, 'crear', file.generated, new Set());
    const again = parseWizardFile(res.wizard);
    expect(handEdited(res.project, built.project, again.generated)).toEqual([]);
    const { answers, notes } = resumeAnswers(again, res.project, res.csv);
    expect(notes).toEqual([]);
    expect(answers.types[0].cards![0].titulo).toBe('Lobo');
    expect(fingerprint(res.project, res.csv).csv).toBe(again.generated!.csv);
  });
});
