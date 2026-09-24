import { describe, expect, it } from 'vitest';
import { MemorySource } from '../assets';
import { planExport } from '../deck';
import { hasColumn, loadProject, projectIssues, templateColumns } from '../project';
import { defaultAnswers, DESIGNS, withDefaults, type WizardAnswers } from './answers';
import { buildProject, projectFiles } from './build';

/** Un juego con de todo: dos idiomas, tres tipos (uno «igual que» otro), atributos, coste y rareza. */
function rich(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  const a = defaultAnswers();
  return {
    ...a,
    name: 'Naves',
    langs: ['es', 'en'],
    types: [
      { label: 'Criatura', count: 6, elements: ['art', 'subtitle', 'rules', 'flavor', 'cost', 'stats', 'variant', 'number'], attributes: ['ataque', 'vida'] },
      { label: 'Hechizo', count: 4, elements: ['art', 'rules', 'cost', 'number'], attributes: [] },
      { label: 'Criatura épica', count: 2, elements: [], attributes: [], sameAs: 'Criatura' },
    ],
    ...overrides,
  };
}

async function load(answers: WizardAnswers) {
  const built = buildProject(answers);
  return { built, lp: await loadProject(new MemorySource('mem', projectFiles(built))) };
}

describe('buildProject', () => {
  for (const design of DESIGNS.map((d) => d.id)) {
    for (const backs of ['common', 'per-type', 'none'] as const) {
      it(`${design} con traseras «${backs}»: carga sin errores ni avisos`, async () => {
        const { lp } = await load(rich({ design, backs }));
        expect(lp.errors).toEqual([]);
        expect(projectIssues(lp)).toEqual([]);
        for (const [tipo, tpl] of Object.entries(lp.project.templates)) {
          for (const c of templateColumns(tpl)) expect(hasColumn(lp.columns, c), `${tipo}: falta la columna ${c.name}`).toBe(true);
        }
        const plan = planExport(lp.rows, lp.rows.map((_, i) => i), lp.project);
        expect(plan.warnings).toEqual([]);
        expect(plan.fronts).toHaveLength(12);
        expect(plan.backs).toHaveLength(backs === 'none' ? 0 : backs === 'common' ? 1 : 3);
      });
    }
  }

  it('genera filas con ids únicos, textos en cada idioma y rareza cíclica', async () => {
    const { lp } = await load(rich());
    const ids = lp.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(['CRI-001', 'CRI-002']);
    expect(ids).toContain('HEC-001');
    expect(ids).toContain('CR2-001');
    const first = lp.rows[0];
    expect(first['titulo-es']).toBe('Criatura 1');
    expect(first['descripcion-en']).toBe('Write the rules text here. {ataque}');
    expect(first.rareza).toBe('Común');
    expect(lp.rows[1].rareza).toBe('Rara');
    expect(first.atributos).toMatch(/^coste:1 \| ataque:\d \| vida:\d$/);
    expect(first.numero).toBe('001/012');
    expect(lp.langs).toEqual(['es', 'en']);
  });

  it('con un idioma las columnas no llevan sufijo', async () => {
    const { lp } = await load(rich({ langs: ['es'] }));
    expect(lp.columns).toContain('titulo');
    expect(lp.columns).not.toContain('titulo-es');
  });

  it('«igual que» copia elementos y atributos del otro tipo', async () => {
    const { lp } = await load(rich());
    const ids = (t: string) => lp.project.templates[t].zones.map((z) => z.id).sort();
    expect(ids('criatura epica')).toEqual(ids('criatura'));
  });

  it('cada imagen provisional que usan las plantillas existe', async () => {
    const { built, lp } = await load(rich());
    const images = Object.values(lp.project.templates).flatMap((t) => t.zones.flatMap((z) => (z.type === 'image' && z.default ? [z.default] : [])));
    const icons = Object.values(lp.project.attributes).map((d) => d.icon);
    for (const p of [...images, ...icons]) expect(built.files[`assets/${p}`], p).toMatch(/^<svg /);
  });

  it('sin atributos ni coste no hay columna de atributos; la paleta está en el proyecto', async () => {
    const a = defaultAnswers();
    a.types[0].label = 'Carta';
    const { lp } = await load(a);
    expect(lp.columns).not.toContain('atributos');
    expect(lp.project.attributes).toEqual({});
    expect(lp.project.colors).toMatchObject({ principal: '#1f3a5f', papel: '#efe6d2' });
    expect(lp.rows).toHaveLength(21);
  });
});

describe('datos de cartas y ajuste fino', () => {
  it('usa lo escrito en cada carta y rellena el resto con ejemplos', async () => {
    const a = rich({ langs: ['es'] });
    a.types[0].cards = [
      { id: 'DRAGON', titulo: 'Dragón', descripcion: 'Vuela.', 'attr:ataque': '7', coste: '4', variante: 'Épica', ilustracion: 'ilustraciones/dragon.png', copias: '2' },
      { titulo: 'Lobo' },
    ];
    const { lp } = await load(a);
    const [dragon, lobo, tercera] = lp.rows;
    expect(dragon).toMatchObject({ id: 'DRAGON', titulo: 'Dragón', descripcion: 'Vuela.', rareza: 'Épica', ilustracion: 'ilustraciones/dragon.png', copias: '2' });
    expect(dragon.atributos).toMatch(/^coste:4 \| ataque:7 \| vida:\d$/);
    expect(lobo).toMatchObject({ id: 'CRI-002', titulo: 'Lobo', descripcion: 'Escribe aquí el texto de reglas.', ilustracion: '' });
    expect(tercera.titulo).toBe('Criatura 3');
  });

  it('el ajuste fino cambia piezas y textos', async () => {
    const a = rich({ langs: ['es'] });
    a.fine = {
      pieces: { 'caja de texto': { fill: 'none', border: true }, cabecera: { fill: 'acento', opacity: 0.5 } },
      texts: { reglas: { scale: 1.2, color: 'papel' }, titulo: { scale: 9 } },
    };
    const { lp } = await load(a);
    const zones = Object.fromEntries(lp.project.templates.criatura.zones.map((z) => [z.id, z]));
    expect(zones['caja de texto']).toMatchObject({ stroke: 'acento' });
    expect((zones['caja de texto'] as { fill?: string }).fill).toBeUndefined();
    expect(zones.cabecera).toMatchObject({ fill: 'acento', opacity: 0.5 });
    expect(zones.reglas).toMatchObject({ font: { size: 9, color: 'papel' } });
    expect((zones.titulo as { font: { size: number } }).font.size).toBe(15.75); // escala limitada a 1,5
  });
});

describe('withDefaults', () => {
  it('completa un borrador antiguo sin romper lo que tenía', () => {
    const old = { name: 'Viejo', types: [{ label: 'Clan', count: 3 }], adjust: { art: 0.4 } } as never;
    const a = withDefaults(old);
    expect(a.name).toBe('Viejo');
    expect(a.types[0]).toMatchObject({ label: 'Clan', count: 3, elements: [], attributes: [] });
    expect(a.adjust.art).toBe(0.4);
    expect(a.adjust.palette.principal).toBe(defaultAnswers().adjust.palette.principal);
    expect(a.fine).toEqual({ pieces: {}, texts: {} });
    expect(withDefaults(null)).toEqual(defaultAnswers());
  });
});
