import { describe, expect, it } from 'vitest';
import { defaultAnswers } from '../../core/wizard/answers';
import { parseProgress, progressJson, PROGRESS_FORMAT } from './preview';

describe('archivo de progreso', () => {
  it('versión 2: lleva los iconos y fondos dentro', async () => {
    const a = defaultAnswers();
    a.attributes[0].icon = 'iconos/espada.svg';
    const res = new Map([['iconos/espada.svg', new Blob(['<svg/>'], { type: 'image/svg+xml' })]]);
    const p = parseProgress(await progressJson(a, 'recorrido', res));
    expect(p.step).toBe('recorrido');
    expect(p.answers.attributes[0].icon).toBe('iconos/espada.svg');
    expect(await p.resources!.get('iconos/espada.svg')!.text()).toBe('<svg/>');
  });

  it('versión 1 (sin recursos) se sigue cargando', () => {
    const old = JSON.stringify({ format: PROGRESS_FORMAT, version: 1, step: 'fino', answers: { name: 'Viejo' } });
    const p = parseProgress(old);
    expect(p.answers.name).toBe('Viejo');
    expect(p.step).toBe('fino');
    expect(p.resources!.size).toBe(0);
  });
});
