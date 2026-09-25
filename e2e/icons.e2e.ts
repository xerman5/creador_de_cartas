import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { activeStep, fixture, next, nextUntil, startWizard, toggleElements, trackErrors } from './helpers';

test('atributos con número y habilidades, iconos propios, tabla y progreso con iconos', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await startWizard(page, 'Bestias', [{ label: 'Criatura', count: 4 }]);
  await toggleElements(page, ['Coste', 'Atributos y habilidades']);
  await next(page);
  await expect(activeStep(page)).toContainText('Atributos');

  // Dos habilidades (solo icono), marcadas para el tipo.
  for (const name of ['Volar', 'Veneno']) {
    await page.getByRole('button', { name: '＋ Solo icono' }).click();
    await page.locator('.row.attr input[type=text]').last().fill(name);
    await page.getByLabel(`${name} en Criatura`).check();
  }

  // Iconos soltados en «Tus iconos»: se ponen solos por su nombre.
  await page.locator('.shelf input[type=file]').setInputFiles([fixture('iconos', 'Volar.png'), fixture('iconos', 'veneno.png'), fixture('iconos', 'ataque.svg')]);
  await expect(page.locator('.report').first()).toContainText('puestos por su nombre: Ataque, Volar, Veneno');

  // Arrastrar una miniatura al hueco de un atributo, con el ratón.
  await page.locator('.shelf .thumb[title="iconos/veneno.png"]').dragTo(page.getByRole('button', { name: 'Icono de Vida' }));
  // Elegir con un clic: el hueco abre el modo elegir.
  await page.getByRole('button', { name: 'Icono de Ataque' }).click();
  await expect(page.locator('.hint.pick')).toContainText('Elige el icono de Ataque');
  await page.locator('.shelf .thumb[title="Usar iconos/volar.png"]').click();

  // En la tabla, las habilidades son casillas.
  await nextUntil(page, 'Cartas');
  const heads = await page.locator('table.cards thead th').allTextContents();
  expect(heads).toEqual(expect.arrayContaining(['Coste', 'Ataque', 'Vida', 'Volar', 'Veneno']));
  const first = page.locator('table.cards tbody tr').first();
  await first.locator('td').nth(heads.indexOf('Título')).locator('input').fill('Grifo');
  await first.locator('td').nth(heads.indexOf('Volar')).locator('input[type=checkbox]').check();

  // Progreso: lleva los iconos dentro y se carga en otro navegador.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Guardar progreso' }).click()]);
  const file = await download.path();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.version).toBe(2);
  expect(Object.keys(saved.resources).sort()).toEqual(['iconos/ataque.svg', 'iconos/veneno.png', 'iconos/volar.png']);
  const icons = Object.fromEntries(saved.answers.attributes.map((a: { label: string; icon?: string; kind?: string }) => [a.label, [a.kind ?? 'number', a.icon]]));
  expect(icons).toEqual({
    Ataque: ['number', 'iconos/volar.png'],
    Vida: ['number', 'iconos/veneno.png'],
    Volar: ['icon', 'iconos/volar.png'],
    Veneno: ['icon', 'iconos/veneno.png'],
  });
  expect(saved.answers.types[0].cards[0]).toMatchObject({ titulo: 'Grifo', 'attr:volar': 'x' });

  const other = await (await browser.newContext()).newPage();
  await other.goto('/');
  await other.getByText('Crear con el asistente').click();
  await other.locator('input[accept=".json,application/json"]').setInputFiles(file);
  await other.locator('.steps button', { hasText: 'Atributos' }).click();
  await expect(other.locator('.shelf .item')).toHaveCount(3);

  expect(errors).toEqual([]);
});
