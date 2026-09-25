import { expect, test } from '@playwright/test';
import { activeStep, mockFolder, nextUntil, readFolderFile, shot, startWizard, trackErrors } from './helpers';

test('desde una carta: ajustar un elemento en el editor sencillo o en el asistente', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'editor');
  await startWizard(page, 'Bestias', [{ label: 'Criatura', count: 2 }]);
  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();

  // Galería → detalle de la carta → pulsar el título.
  const clickCard = async (fy: number) => {
    const card = page.locator('.dialog .pick');
    const b = (await card.boundingBox())!;
    await card.click({ position: { x: b.width / 2, y: b.height * fy } });
  };
  await page.locator('main .thumb').first().click();
  await clickCard(0.1);
  await expect(page.locator('.picked b')).toHaveText('titulo');

  // Editor en modo sencillo con esa zona seleccionada.
  await page.getByRole('button', { name: 'Editar en la plantilla' }).click();
  await expect(page.locator('.simple h4')).toContainText('titulo');
  await page.getByRole('group', { name: 'Alineación' }).getByRole('button', { name: 'Izquierda' }).click();
  await page.getByRole('button', { name: 'Color del texto: acento' }).click();
  await shot(page, 'editor-sencillo');
  // El modo avanzado sigue ahí, con todas las propiedades.
  await page.getByRole('button', { name: 'Avanzado' }).click();
  await expect(page.getByText('Columna CSV').first()).toBeVisible();
  await page.getByRole('button', { name: 'Sencillo' }).click();
  await page.keyboard.press('Control+s');
  await expect
    .poll(async () => {
      const p = JSON.parse((await readFolderFile(page, 'editor', 'proyecto.json')) ?? '{}');
      const z = p.templates?.criatura?.zones.find((x: { id: string }) => x.id === 'titulo');
      return `${z?.align} ${z?.font?.color}`;
    })
    .toBe('left acento');

  // Galería → pulsar las reglas → el asistente abre ese elemento del recorrido.
  await page.getByRole('button', { name: '5 · Cartas' }).click();
  await page.locator('main .thumb').first().click();
  await clickCard(0.72);
  await expect(page.locator('.picked b')).toHaveText('reglas');
  await page.getByRole('button', { name: 'Ajustar en el asistente' }).click();
  await expect(activeStep(page)).toContainText('Tipo a tipo');
  await expect(page.locator('.tour h3')).toHaveText('Reglas');
  // Retocar la plantilla en el editor cuenta como retoque a mano al aplicar.
  await nextUntil(page, 'Crear');
  await expect(page.getByLabel(/Conservar mis retoques en «criatura»/)).toBeChecked();

  expect(errors).toEqual([]);
});
