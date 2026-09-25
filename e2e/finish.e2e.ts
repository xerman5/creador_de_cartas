import { expect, test } from '@playwright/test';
import { fixture, mockFolder, next, nextUntil, readFolderFile, shot, startWizard, trackErrors } from './helpers';

test('fuentes propias, trasera a medida y repaso final antes de crear', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'final');
  await startWizard(page, 'Bestias', [{ label: 'Criatura', count: 3 }]);

  // Cartas (antes del diseño): un texto que no cabe, para el repaso.
  await nextUntil(page, 'Cartas');
  const heads = await page.locator('table.cards thead th').allTextContents();
  await page.locator('table.cards tbody tr').nth(1).locator('td').nth(heads.indexOf('Reglas')).locator('textarea').fill('Muy largo. '.repeat(120));
  await nextUntil(page, 'Ajustes');

  // Fuentes propias: se suben y se eligen para los títulos.
  await page.locator('input[accept=".ttf,.otf,.woff,.woff2"]').setInputFiles(fixture('fuentes', 'EricaOne-Regular.ttf'));
  await expect(page.locator('.font-row')).toContainText('Erica One');
  await page.getByLabel('Fuente de los títulos').selectOption('Erica One');

  // En el recorrido, la fuente propia también se puede elegir para un texto concreto.
  await next(page);
  await page.locator('.tour .els button', { hasText: 'Reglas' }).click();
  await page.getByRole('group', { name: 'Letra de Reglas' }).getByRole('button', { name: 'Erica One' }).click();

  // Trasera: dibujo propio y banda transparente.
  await nextUntil(page, 'Traseras');
  await page.getByRole('button', { name: 'Icono de Dibujo del dorso' }).click();
  await page.locator('.shelf input[type=file]').setInputFiles(fixture('fondos', 'pergamino.png'));
  await page.getByRole('button', { name: 'Banda: Transparente' }).click();
  await page.getByRole('checkbox', { name: 'Borde' }).uncheck();
  await shot(page, 'trasera');

  // Repaso: el texto que no cabe aparece con su carta, y el enlace lleva a ella.
  await nextUntil(page, 'Crear');
  await expect(page.locator('.review')).toContainText('4 cartas revisadas');
  await expect(page.locator('.review .issues').first()).toContainText('criatura-002');
  await expect(page.locator('.review .issues').first()).toContainText('no cabe');
  await shot(page, 'repaso');
  await page.locator('.review .issues button', { hasText: 'criatura-002' }).click();
  await expect(page.locator('table.cards tbody tr.selected td.n')).toHaveText('2');

  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  const project = JSON.parse((await readFolderFile(page, 'final', 'proyecto.json'))!);
  expect(project.fonts).toEqual([{ family: 'Erica One', file: 'fuentes/ericaone-regular.ttf' }]);
  const zone = (t: string, id: string) => project.templates[t].zones.find((z: { id: string }) => z.id === id);
  expect(zone('criatura', 'titulo').font.family).toMatch(/^"Erica One", /);
  expect(zone('criatura', 'reglas').font.family).toMatch(/^"Erica One", /);
  expect(zone('trasera', 'dibujo').default).toBe('fondos/pergamino.png');
  expect(zone('trasera', 'banda').fill).toBeUndefined();
  expect(zone('trasera', 'banda').stroke).toBeUndefined();
  expect(await readFolderFile(page, 'final', 'assets/fuentes/ericaone-regular.ttf')).not.toBeNull();

  expect(errors).toEqual([]);
});
