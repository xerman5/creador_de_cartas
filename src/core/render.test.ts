import { describe, expect, it } from 'vitest';
import { tokenize } from './render';

describe('tokenize', () => {
  it('reconoce negrita, cursiva, iconos y saltos de línea', () => {
    expect(tokenize('**A** *b* {Fuerza}\\nc<br>d')).toEqual([
      { t: 'w', s: 'A', b: true, i: false },
      { t: 'sp' },
      { t: 'w', s: 'b', b: false, i: true },
      { t: 'sp' },
      { t: 'icon', key: 'fuerza' },
      { t: 'nl' },
      { t: 'w', s: 'c', b: false, i: false },
      { t: 'nl' },
      { t: 'w', s: 'd', b: false, i: false },
    ]);
  });

  it('colapsa espacios seguidos', () => {
    expect(tokenize('a   b').filter((t) => t.t === 'sp')).toHaveLength(1);
  });
});
