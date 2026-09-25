import { describe, expect, it } from 'vitest';
import { safeAreaIssues } from '../card';
import type { Rect, Zone } from '../types';
import { defaultAnswers, DESIGNS, type Adjust, type ElementKey } from './answers';
import { layoutZones } from './designs';

const ALL: Exclude<ElementKey, 'title'>[] = ['art', 'subtitle', 'rules', 'flavor', 'cost', 'stats', 'variant', 'number'];
const SIZES = [
  { width: 63, height: 88, safe: 3 },
  { width: 70, height: 120, safe: 3 },
  { width: 41, height: 63, safe: 3 },
  { width: 70, height: 70, safe: 3 },
];
const SIDES: Adjust['attrSide'][] = ['left', 'right', 'bottom'];
const CORNERS: Adjust['costCorner'][] = ['left', 'right'];

/** Solape real: por debajo de 0,02 mm es redondeo a centésimas. */
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.02 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.02;
const isContent = (z: Zone) => z.type === 'text' || z.type === 'attribute' || z.type === 'attributes';

function* combos() {
  for (let mask = 0; mask < 1 << ALL.length; mask++) {
    const elements = new Set(ALL.filter((_, i) => mask & (1 << i)));
    for (const design of DESIGNS.map((d) => d.id))
      for (const size of SIZES)
        for (const attrSide of SIDES)
          for (const costCorner of CORNERS)
            for (const art of [0.3, 0.75])
              // Sin título, en la mitad de los casos: su sitio se reparte y nada se pisa.
              yield { design, elements, size, title: (mask + (art === 0.3 ? 0 : 1)) % 2 === 0, adjust: { ...defaultAnswers().adjust, attrSide, costCorner, art } };
  }
}

describe('layoutZones: todas las combinaciones', () => {
  it('ningún contenido en la zona peligrosa, sin solapes y todo dentro de la carta', () => {
    const problems: string[] = [];
    let n = 0;
    for (const c of combos()) {
      n++;
      // Números y habilidades en cantidades distintas, incluida ninguna de una de las dos.
      const statKeys = ['ataque', 'defensa', 'vida', 'velocidad'].slice(0, n % 5);
      const abilityKeys = ['volar', 'veneno', 'sigilo'].slice(0, (n >> 1) % 4);
      const zones = layoutZones({ ...c, tipo: 'criatura', statKeys, abilityKeys, variantColumn: 'rareza' });
      const where = `${c.design} ${c.size.width}×${c.size.height} [${c.title ? 'title,' : ''}${[...c.elements].join(',')}] ${c.adjust.attrSide}/${c.adjust.costCorner}/${c.adjust.art} ${statKeys.length}+${abilityKeys.length}`;
      const f = Math.min(c.size.width / 63, c.size.height / 88);

      for (const i of safeAreaIssues({ zones }, c.size)) problems.push(`${where}: ${i.message}`);

      const ids = zones.map((z) => z.id);
      if (new Set(ids).size !== ids.length) problems.push(`${where}: ids repetidos ${ids}`);
      if (zones.some((z) => z.id === 'titulo') !== c.title) problems.push(`${where}: ${c.title ? 'sin título' : 'con título'}`);

      for (const z of zones) {
        const r = z.rect;
        if (!(r.w > 0 && r.h > 0)) problems.push(`${where}: «${z.id}» sin tamaño`);
        if (!z.bleed && (r.x < -0.01 || r.y < -0.01 || r.x + r.w > c.size.width + 0.01 || r.y + r.h > c.size.height + 0.01))
          problems.push(`${where}: «${z.id}» fuera de la carta`);
        if (z.type === 'image' && !z.bleed && r.h < 12 * f) problems.push(`${where}: ilustración diminuta (${r.h} mm)`);
        if (z.type === 'text' && r.h < 2.5 * f) problems.push(`${where}: «${z.id}» demasiado baja (${r.h} mm)`);
        if (z.type === 'text' && z.id === 'reglas' && r.h < 10 * f) problems.push(`${where}: reglas sin sitio (${r.h} mm)`);
        if (z.type === 'attributes') {
          const k = z.keys!.length;
          const along = z.direction === 'column' ? r.h : r.w;
          if (k * z.iconSize + (k - 1) * (z.gap ?? 0) > along + 0.01) problems.push(`${where}: los iconos no caben`);
          if (z.iconSize < 3.5 * f) problems.push(`${where}: iconos diminutos (${z.iconSize} mm)`);
        }
      }

      const content = zones.filter(isContent);
      for (let i = 0; i < content.length; i++)
        for (let j = i + 1; j < content.length; j++)
          if (overlaps(content[i].rect, content[j].rect)) problems.push(`${where}: «${content[i].id}» pisa «${content[j].id}»`);

      if (problems.length > 20) break;
    }
    expect(problems.slice(0, 20)).toEqual([]);
    expect(n).toBe(256 * 4 * 4 * 3 * 2 * 2);
  });

  it('cada elemento pedido aparece y los no pedidos no', () => {
    const expected: Record<Exclude<ElementKey, 'title'>, string> = {
      art: 'ilustracion',
      subtitle: 'linea de tipo',
      rules: 'reglas',
      flavor: 'ambientacion',
      cost: 'coste',
      stats: 'atributos',
      variant: 'marca',
      number: 'numero',
    };
    for (const design of DESIGNS.map((d) => d.id)) {
      for (const el of ALL) {
        const zones = layoutZones({
          design,
          elements: new Set([el]),
          size: SIZES[0],
          adjust: defaultAnswers().adjust,
          tipo: 't',
          statKeys: ['vida'],
          variantColumn: 'rareza',
        });
        const ids = zones.map((z) => z.id);
        expect(ids, `${design}/${el}`).toContain(expected[el]);
        for (const other of ALL.filter((o) => o !== el)) expect(ids, `${design}/${el}`).not.toContain(expected[other]);
      }
    }
  });

  it('sin título, su banda o placa desaparece y la ilustración sube', () => {
    for (const design of DESIGNS.map((d) => d.id)) {
      const layout = (title: boolean) =>
        layoutZones({
          design,
          elements: new Set<ElementKey>(['art', 'rules']),
          size: SIZES[0],
          adjust: defaultAnswers().adjust,
          tipo: 't',
          statKeys: [],
          variantColumn: 'rareza',
          title,
        });
      const without = layout(false);
      const ids = without.map((z) => z.id);
      expect(ids, design).not.toContain('titulo');
      expect(ids, design).not.toContain('cabecera');
      expect(ids, design).not.toContain('placa');
      const art = (zones: Zone[]) => zones.find((z) => z.id === 'ilustracion')!.rect;
      // La ilustración a sangre (completa) no cambia; en los demás, gana alto.
      if (design !== 'completa') expect(art(without).h, design).toBeGreaterThan(art(layout(true)).h);
    }
  });

  it('las habilidades van en su propia zona, sin número, con o sin ilustración', () => {
    for (const design of DESIGNS.map((d) => d.id)) {
      for (const art of [true, false]) {
        const zones = layoutZones({
          design,
          elements: new Set<ElementKey>(art ? ['art', 'stats', 'rules'] : ['stats', 'rules']),
          size: SIZES[0],
          adjust: defaultAnswers().adjust,
          tipo: 't',
          statKeys: [],
          abilityKeys: ['volar', 'veneno'],
          variantColumn: 'rareza',
        });
        const ids = zones.map((z) => z.id);
        expect(ids, `${design}/${art}`).toContain('habilidades');
        expect(ids, `${design}/${art}`).not.toContain('atributos');
        const ab = zones.find((z) => z.id === 'habilidades');
        expect(ab).toMatchObject({ type: 'attributes', keys: ['volar', 'veneno'], direction: 'row' });
        if (art) {
          // Sobre la ilustración: no le quita sitio al texto.
          const img = zones.find((z) => z.id === 'ilustracion')!.rect;
          expect(ab!.rect.y).toBeGreaterThanOrEqual(img.y);
          expect(ab!.rect.y + ab!.rect.h).toBeLessThanOrEqual(img.y + img.h + 0.01);
        }
      }
    }
  });
});

describe('alineación por defecto', () => {
  it('todos los textos de contenido van centrados', () => {
    for (const design of DESIGNS.map((d) => d.id)) {
      const zones = layoutZones({
        design,
        elements: new Set(ALL),
        size: SIZES[0],
        adjust: defaultAnswers().adjust,
        tipo: 't',
        statKeys: ['vida'],
        variantColumn: 'rareza',
      });
      for (const z of zones) if (z.type === 'text' && z.id !== 'numero') expect(z.align, `${design}/${z.id}`).toBe('center');
    }
  });
});
