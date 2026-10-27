import { test, expect } from "@playwright/test";
import path from "node:path";

test("checklist com foto sobrevive offline, reabre e sincroniza sem duplicar", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("operador@hering.local");
  await page.getByLabel("Senha", { exact: true }).fill("Checklist@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Checklists", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Checklists", exact: true }),
  ).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("checklist-session-v1")!),
  );
  const existing = await request.get("/api/executions", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const previousIds = new Set(
    (await existing.json()).map((e: { id: string }) => e.id),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Sem internet", { exact: true })).toBeVisible();
  const opening = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "Abertura da loja", exact: true }),
    });
  await opening.getByRole("button", { name: "Iniciar checklist" }).click();
  await page.getByRole("button", { name: "Concluir checklist" }).click();
  await expect(
    page.getByText("Responda este item para finalizar.").first(),
  ).toBeVisible();
  const items = page.locator(".checklist-item");
  await items
    .nth(0)
    .getByRole("radio", { name: "Conforme", exact: true })
    .check();
  await items
    .nth(1)
    .getByRole("radio", { name: "Não conforme", exact: true })
    .check();
  await items
    .nth(2)
    .getByRole("radio", { name: "Não se aplica", exact: true })
    .check();
  await items
    .nth(3)
    .getByRole("radio", { name: "Conforme", exact: true })
    .check();
  await page.getByRole("button", { name: "Concluir checklist" }).click();
  await expect(
    page.getByText("Adicione uma foto da não conformidade."),
  ).toBeVisible();
  await items
    .nth(1)
    .locator("input[type=file]")
    .setInputFiles(path.resolve("apps/web/public/icon-192.png"));
  await expect(
    page.getByText("Foto salva no aparelho", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Salvo no aparelho", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page
      .locator(".checklist-item")
      .nth(1)
      .getByRole("radio", { name: "Não conforme", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByAltText("Evidência: Vitrine limpa e organizada"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Concluir checklist" }).click();
  await expect(
    page.getByRole("heading", { name: "Checklist concluído" }),
  ).toBeVisible();
  await expect(page.getByText("66,67%", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pendente de envio", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Sincronizado", { exact: true })).toBeVisible({
    timeout: 45000,
  });
  const latest = await request.get("/api/executions", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const created = (await latest.json()).filter(
    (e: { id: string }) => !previousIds.has(e.id),
  );
  expect(created).toHaveLength(1);
  const execution = created[0];
  const replay = await request.put(`/api/sync/executions/${execution.id}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    data: execution,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).synced).toBe(true);
  const afterReplay = await request.get("/api/executions", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(
    (await afterReplay.json()).filter(
      (e: { id: string }) => e.id === execution.id,
    ),
  ).toHaveLength(1);
  const response = await request.post("/api/auth/login", {
    data: { email: "gerente@hering.local", password: "Checklist@123" },
  });
  const manager = await response.json();
  const actions = await request.get("/api/actions", {
    headers: { Authorization: `Bearer ${manager.token}` },
  });
  const plans = (await actions.json()).filter(
    (a: { executionId: string }) => a.executionId === execution.id,
  );
  expect(plans).toHaveLength(1);
  expect(plans[0].sourcePhotos).toHaveLength(1);
  const photo = await request.get(plans[0].sourcePhotos[0].url);
  expect(photo.status()).toBe(200);
});
