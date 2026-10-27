import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Checklist@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("administrador cria, ordena, edita e desativa um modelo no celular", async ({
  page,
}, testInfo) => {
  const name = `Revisão UX ${testInfo.project.name} ${Date.now()}`;
  await signIn(page, "admin@hering.local");
  await expect(
    page.getByRole("heading", { name: "Modelos de checklist", exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Novo modelo", exact: true }).click();
  await page.getByLabel("Nome do checklist", { exact: true }).fill(name);
  await page
    .getByLabel("Descrição do item 1", { exact: true })
    .fill("Porta conferida");
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await page
    .getByLabel("Descrição do item 2", { exact: true })
    .fill("Material de campanha conferido");
  await page
    .getByLabel("Resposta obrigatória", { exact: true })
    .nth(1)
    .uncheck();
  await page
    .getByRole("button", { name: "Mover item 2 para cima", exact: true })
    .click();
  await expect(
    page.getByLabel("Descrição do item 1", { exact: true }),
  ).toHaveValue("Material de campanha conferido");
  await expect(
    page.getByLabel("Resposta obrigatória", { exact: true }).nth(0),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Resposta obrigatória", { exact: true }).nth(1),
  ).toBeChecked();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("editor-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Salvar modelo", exact: true })
    .click();

  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByLabel("Descrição do item 1", { exact: true }),
  ).toHaveValue("Material de campanha conferido");
  await expect(
    page.getByLabel("Descrição do item 2", { exact: true }),
  ).toHaveValue("Porta conferida");
  await expect(
    page.getByLabel("Resposta obrigatória", { exact: true }).nth(0),
  ).not.toBeChecked();
  await page
    .getByLabel("Descrição opcional", { exact: true })
    .fill("Modelo revisado na interface.");
  await page
    .getByLabel("Cargo responsável", { exact: true })
    .selectOption("manager");
  await page
    .getByRole("button", { name: "Salvar modelo", exact: true })
    .click();
  await expect(
    card.getByText("2 itens · Gerente · Versão 2", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Modelo revisado na interface.", { exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(card.getByText("Desativado", { exact: true })).toBeVisible();
});

test("operador recebe erros claros, foco no item e retoma as respostas salvas", async ({
  page,
}, testInfo) => {
  await signIn(page, "operador@hering.local");
  await expect(
    page.getByRole("heading", { name: "Checklists", exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: "Ações" }),
  ).toHaveCount(0);
  const model = page
    .locator(".template-card")
    .filter({
      has: page.getByRole("heading", { name: "Abertura da loja", exact: true }),
    });
  await model
    .getByRole("button", { name: "Iniciar checklist", exact: true })
    .click();

  const first = page.getByRole("region", {
    name: "Alarme desativado e acesso liberado",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Concluir checklist", exact: true })
    .click();
  await expect(first.getByRole("alert")).toHaveText(
    "Responda este item para finalizar.",
  );
  await expect(
    first.getByRole("radio", { name: "Conforme", exact: true }),
  ).toBeFocused();
  await first.getByRole("radio", { name: "Não conforme", exact: true }).check();
  await expect(
    first.getByText("Foto da não conformidade · obrigatória", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Concluir checklist", exact: true })
    .click();
  await expect(first.getByRole("alert")).toHaveText(
    "Adicione uma foto da não conformidade.",
  );
  await expect(
    first.getByLabel("Foto da não conformidade · obrigatória", { exact: true }),
  ).toBeFocused();
  await first
    .getByRole("radio", { name: "Não se aplica", exact: true })
    .check();
  await expect(
    page.getByText("Salvo no aparelho", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("execucao-mobile.png"),
    fullPage: true,
  });

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Checklists", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Checklists", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar", exact: true })
    .first()
    .click();
  await expect(
    first.getByRole("radio", { name: "Não se aplica", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("progressbar", { name: "Itens respondidos" }),
  ).toHaveAttribute("aria-valuenow", "1");
});

test("gerente inicia e conclui uma ação com foto real da correção", async ({
  page,
  request,
}, testInfo) => {
  const marker = `Revisão de correção ${testInfo.project.name} ${Date.now()}`;
  const auth = await request.post("/api/auth/login", {
    data: { email: "operador2@hering.local", password: "Checklist@123" },
  });
  expect(auth.ok()).toBe(true);
  const session = await auth.json();
  const headers = { Authorization: `Bearer ${session.token}` };
  const templates = await request.get("/api/templates", { headers });
  const template = (await templates.json()).find(
    (entry: { name: string }) => entry.name === "Abertura da loja",
  );
  expect(template).toBeTruthy();
  const fixture = await readFile(path.resolve("apps/web/public/icon-192.png"));
  const photo = {
    id: randomUUID(),
    contentType: "image/png",
    size: fixture.length,
  };
  const timestamp = new Date().toISOString();
  const execution = {
    id: randomUUID(),
    template,
    storeId: session.user.storeId,
    userId: session.user.id,
    userName: session.user.name,
    startedAt: timestamp,
    finishedAt: timestamp,
    score: 80,
    syncStatus: "pending",
    answers: template.items.map((item: { id: string }, index: number) => ({
      id: randomUUID(),
      itemId: item.id,
      value: index === 0 ? "NC" : "C",
      observation: index === 0 ? marker : "",
      photos: index === 0 ? [photo] : [],
    })),
  };
  const prepared = await request.put(`/api/sync/executions/${execution.id}`, {
    headers,
    data: execution,
  });
  expect(prepared.ok()).toBe(true);
  const ticket = (await prepared.json()).uploads[0];
  const upload = await request.put(ticket.url, {
    headers: ticket.headers,
    data: fixture,
  });
  expect(upload.ok()).toBe(true);
  const committed = await request.post(
    `/api/sync/executions/${execution.id}/commit`,
    { headers },
  );
  expect(committed.ok()).toBe(true);

  await signIn(page, "gerente2@hering.local");
  await expect(
    page.getByRole("heading", { name: "Checklists", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: /^Ações/ })
    .click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: `Corrigir: Alarme desativado e acesso liberado. ${marker}`,
        exact: true,
      }),
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Corrigir não conformidade",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByAltText("Não conformidade registrada", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar correção", exact: true })
    .click();
  await expect(page.getByText("Em andamento", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Concluir ação", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Adicione uma foto da correção." })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByLabel("Foto da correção · obrigatória para concluir", {
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByLabel("Foto da correção · obrigatória para concluir", { exact: true })
    .setInputFiles(path.resolve("apps/web/public/icon-192.png"));
  await page
    .getByRole("button", { name: "Concluir ação", exact: true })
    .click();
  await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
  await expect(
    page.getByAltText("Evidência da correção", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("acao-concluida-mobile.png"),
    fullPage: true,
  });

  const managerSession = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("checklist-session-v1")!),
  );
  const actions = await request.get("/api/actions", {
    headers: { Authorization: `Bearer ${managerSession.token}` },
  });
  const action = (await actions.json()).find(
    (entry: { executionId: string }) => entry.executionId === execution.id,
  );
  expect(action.status).toBe("completed");
  expect(action.photos).toHaveLength(1);
  expect((await request.get(action.photos[0].url)).ok()).toBe(true);
});
