import { expect, test } from '@playwright/test';
import { activeStep, fixture, mockFolder, next, nextUntil, readFolderFile, startWizard, toggleElements, trackErrors } from './helpers';

test('recorrido tipo a tipo: fondo y marco, ámbito por tipo, clases de atributo y elementos', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'recorrido');
  page.on('dialog', (d) => d.accept('Sigilo'));
  await startWizard(page, 'Bestias', [
    { label: 'Criatura', count: 3 },
    { label: 'Hechizo', count: 2 },
  ]);
  await toggleElements(page, ['Coste', 'Atributos y habilidades']);
  await nextUntil(page, 'Tipo a tipo');
  await expect(page.locator('.tour h3')).toHaveText('Fondo y marco');

  // Fondo y marco para todos: se eligen soltando la imagen con su hueco activo.
  await page.getByRole('button', { name: 'Icono de Imagen de fondo' }).click();
  await page.locator('.tour .shelf input[type=file]').setInputFiles(fixture('fondos', 'pergamino.png'));
  await page.getByRole('button', { name: 'Icono de Marco' }).click();
  await page.locator('.tour .shelf input[type=file]').setInputFiles(fixture('fondos', 'marco-dorado.png'));
  await expect(page.locator('.tour .shelf .item')).toHaveCount(2);

  // Título a la izquierda solo en «Criatura»: el elemento queda marcado con ajustes propios.
  await page.locator('.tour .els button', { hasText: 'Título' }).click();
  await page.getByRole('button', { name: 'Solo «Criatura»' }).click();
  await page.getByRole('group', { name: 'Alineación de Título' }).getByRole('button', { name: 'Izquierda' }).click();
  await page.getByRole('button', { name: 'Todos los tipos' }).click();
  await expect(page.locator('.tour .warn')).toContainText('«Criatura» tiene ajustes propios');
  await expect(page.locator('.tour .els button.own')).toHaveText('Título');

  // Vida pasa a ser solo icono: aparece «Habilidades»; allí se crea otra.
  await page.locator('.tour .els button', { hasText: 'Atributos' }).click();
  await page.getByRole('group', { name: 'Clase de Vida' }).getByRole('button', { name: 'Solo icono' }).click();
  await page.locator('.tour .els button', { hasText: 'Habilidades' }).click();
  await page.getByRole('button', { name: '＋ Habilidad' }).click();
  // Se ven todos (Ataque sigue con número): cambiar uno de clase no lo hace desaparecer de la lista.
  await expect(page.locator('.tour .attr .name:not(.off)')).toHaveText(['Ataque', 'Vida', 'Sigilo']);
  await expect(page.getByRole('group', { name: 'Clase de Sigilo' }).getByRole('button', { name: 'Solo icono' })).toHaveClass(/active/);
  await page.getByLabel(/Escribir el nombre/).check();

  // Añadir la línea de tipo y quitar el número de colección desde el recorrido.
  await page.locator('.tour select.add').selectOption({ label: 'Línea de tipo' });
  await expect(page.locator('.tour .els button', { hasText: 'Línea de tipo' })).toBeVisible();
  await page.locator('.tour .els button', { hasText: 'Número de colección' }).click();
  await page.getByRole('button', { name: /Quitar «Número de colección»/ }).click();
  await expect(page.locator('.tour .els button', { hasText: 'Número de colección' })).toHaveCount(0);

  // «Siguiente» pasa por los elementos que quedan de Criatura y de Hechizo; «Atrás» entra por el final.
  const visited: string[] = [];
  while ((await activeStep(page).innerText()).includes('Tipo a tipo')) {
    visited.push(`${await page.locator('.tour .where b').innerText()}/${await page.locator('.tour h3').innerText()}`);
    await next(page);
  }
  // Hechizo conserva su número de colección: solo se quitó el de Criatura.
  expect(visited.at(-1)).toBe('Hechizo/Número de colección');
  expect(visited).not.toContain('Criatura/Número de colección');
  expect(visited).toContain('Hechizo/Fondo y marco');
  await expect(activeStep(page)).toContainText('Traseras');
  await page.getByRole('button', { name: '← Atrás' }).click();
  await expect(page.locator('.tour h3')).toHaveText('Número de colección');

  // El proyecto creado lleva el fondo, el marco y el título propio de Criatura.
  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  const project = JSON.parse((await readFolderFile(page, 'recorrido', 'proyecto.json'))!);
  const zone = (t: string, id: string) => project.templates[t].zones.find((z: { id: string }) => z.id === id);
  expect(zone('criatura', 'fondo imagen').default).toBe('fondos/pergamino.png');
  expect(zone('hechizo', 'marco imagen').default).toBe('fondos/marco-dorado.png');
  expect(zone('criatura', 'titulo').align).toBe('left');
  expect(zone('hechizo', 'titulo').align).toBe('center');
  expect(zone('criatura', 'habilidades')).toMatchObject({ keys: ['vida', 'sigilo'], labels: true });

  expect(errors).toEqual([]);
});
