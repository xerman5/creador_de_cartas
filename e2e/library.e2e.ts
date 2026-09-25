import { expect, test } from '@playwright/test';
import { fixture, mockFolder, nextUntil, readFolderFile, startWizard, toggleElements, trackErrors } from './helpers';

test('biblioteca del editor: estantes, elegir un icono y soltar una imagen en una zona', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'biblioteca');
  await startWizard(page, 'Ed', [{ label: 'Carta', count: 2 }]);
  await toggleElements(page, ['Atributos y habilidades']);
  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();

  // Recursos: añadir a los estantes; un nombre repetido no pisa al que ya hay.
  await page.getByRole('button', { name: '2 · Recursos' }).click();
  await page.locator('.resources section').nth(0).locator('input[type=file]').setInputFiles([fixture('iconos', 'ataque.svg'), fixture('iconos', 'veneno.png')]);
  await page.locator('.resources section').nth(1).locator('input[type=file]').setInputFiles(fixture('fondos', 'pergamino.png'));
  await page.locator('.resources section').nth(1).locator('input[type=file]').setInputFiles(fixture('fondos', 'pergamino.png'));
  await expect(page.locator('.resources section').nth(1).locator('.item small')).toHaveText(['pergamino-2', 'pergamino']);
  await expect(page.locator('.resources section').nth(1)).toContainText('Sin usar: pergamino-2.png, pergamino.png');
  // Fuentes: se añaden al proyecto con su nombre de familia.
  await page.locator('input[accept=".ttf,.otf,.woff,.woff2"]').setInputFiles(fixture('fuentes', 'EricaOne-Regular.ttf'));
  await expect(page.locator('.resources .font .name')).toHaveText('Erica One');
  await expect(page.locator('.resources .font').getByRole('checkbox', { name: 'En el proyecto' })).toBeChecked();

  // Proyecto › Atributos: el hueco del icono abre la biblioteca.
  await page.getByRole('button', { name: '1 · Proyecto' }).click();
  await page.locator('.icon-cell').first().getByRole('button').first().click();
  await page.locator('.picker .thumb[title="Usar iconos/veneno.png"]').click();
  await expect(page.locator('.icon-cell').first().locator('input[type=text]')).toHaveValue('iconos/veneno.png');

  // Plantillas: soltar un recurso sobre la ilustración la pone como su imagen por defecto.
  await page.getByRole('button', { name: '3 · Plantillas' }).click();
  const box = (await page.locator('.stage').boundingBox())!;
  await page.evaluate(
    ({ x, y }) => {
      const dt = new DataTransfer();
      dt.setData('application/x-recurso', 'fondos/pergamino.png');
      const target = document.elementFromPoint(x, y)!;
      for (const type of ['dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    },
    { x: box.x + box.width / 2, y: box.y + box.height * 0.35 },
  );
  await expect(page.locator('aside input[list^="assets-"]').first()).toHaveValue('fondos/pergamino.png');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await readFolderFile(page, 'biblioteca', 'proyecto.json')) ?? '').toContain('fondos/pergamino.png');
  expect(JSON.parse((await readFolderFile(page, 'biblioteca', 'proyecto.json'))!).fonts).toEqual([{ family: 'Erica One', file: 'fuentes/ericaone-regular.ttf' }]);

  expect(errors).toEqual([]);
});
