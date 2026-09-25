import { expect, test } from '@playwright/test';
import { activeStep, mockFolder, nextUntil, readFolderFile, startWizard, toggleElements, trackErrors, writeFolderFile } from './helpers';

test('retomar el asistente: trae lo cambiado fuera, respeta los retoques y conserva columnas propias', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'retomar');

  // Crear el proyecto con el asistente.
  await startWizard(page, 'Bestias', [
    { label: 'Criatura', count: 3 },
    { label: 'Hechizo', count: 2 },
  ]);
  await toggleElements(page, ['Atributos y habilidades']);
  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  expect(await readFolderFile(page, 'retomar', 'asistente.json')).toContain('"generated"');

  // Fuera del asistente: una plantilla retocada (como en el editor) y el CSV editado (como en Excel).
  const project = JSON.parse((await readFolderFile(page, 'retomar', 'proyecto.json'))!);
  const titulo = project.templates.criatura.zones.find((z: { id: string }) => z.id === 'titulo');
  titulo.rect.x += 1;
  const retouchedX = titulo.rect.x;
  await writeFolderFile(page, 'retomar', 'proyecto.json', JSON.stringify(project, null, 2));
  const csv = (await readFolderFile(page, 'retomar', 'cartas.csv'))!;
  const lines = csv.trimEnd().split('\n');
  const edited = [lines[0] + ',notas', lines[1].replace('Criatura 1', 'Lobo') + ',revisar', ...lines.slice(2).map((l) => l + ',')].join('\r\n');
  await writeFolderFile(page, 'retomar', 'cartas.csv', edited + '\r\n');
  await page.getByTitle('Volver a leer CSV e imágenes').click();
  // Un título de relleno menos: el CSV se ha releído.
  await expect(page.locator('.pending')).toContainText('4 títulos por escribir');

  // Retomar: avisa de lo que trae de fuera y vuelve al recorrido.
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  await expect(page.locator('.report').first()).toContainText('las cartas del CSV');
  await expect(activeStep(page)).toContainText('Tipo a tipo');
  await expect(page.locator('.nav-foot')).toContainText('Proyecto «retomar»');

  // Un cambio en el recorrido: títulos a la izquierda en todos los tipos.
  await page.locator('.tour .els button', { hasText: 'Título' }).click();
  await page.getByRole('group', { name: 'Alineación de Título' }).getByRole('button', { name: 'Izquierda' }).click();
  await expect(page.locator('.nav-foot')).toContainText('cambios sin aplicar');

  // Aplicar: pregunta por la plantilla retocada (por defecto se conserva).
  await nextUntil(page, 'Crear');
  await expect(page.getByRole('heading', { name: 'Aplicar los cambios' })).toBeVisible();
  await expect(page.getByLabel(/Conservar mis retoques en «criatura»/)).toBeChecked();
  await page.getByRole('button', { name: 'Aplicar a «retomar»' }).click();
  await expect(page.locator('.notice')).toContainText('Se han conservado tus retoques en: criatura');

  const after = JSON.parse((await readFolderFile(page, 'retomar', 'proyecto.json'))!);
  const zone = (t: string, id: string) => after.templates[t].zones.find((z: { id: string }) => z.id === id);
  expect(zone('criatura', 'titulo').rect.x).toBe(retouchedX);
  expect(zone('criatura', 'titulo').align).toBe('center');
  expect(zone('hechizo', 'titulo').align).toBe('left');
  const rows = (await readFolderFile(page, 'retomar', 'cartas.csv'))!.trimEnd().split('\n');
  expect(rows[0]).toMatch(/,notas$/);
  expect(rows.find((r) => r.startsWith('criatura-001'))).toMatch(/Lobo.*,revisar$/);

  // Volver otra vez sin haber cambiado nada fuera: no hay nada que traer.
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  await expect(page.locator('.report').first()).toContainText('Retomas el asistente');
  await expect(page.locator('.report').first()).not.toContainText('Se han traído');
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('.pending')).toBeVisible();

  expect(errors).toEqual([]);
});
