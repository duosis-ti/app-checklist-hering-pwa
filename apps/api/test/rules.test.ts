import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  scoreAnswers,
  executionErrors,
  type Execution,
  type Template,
  type User,
} from "@checklist/shared";
import {
  actionDueAt,
  canExecute,
  canSeeStore,
  executionHash,
  validatedExecution,
} from "../src/rules.js";
function fixture() {
  const user: User = {
    id: randomUUID(),
    name: "Operador",
    email: "test@example.com",
    role: "operator",
    storeId: randomUUID(),
    storeName: "Loja",
  };
  const template: Template = {
    id: randomUUID(),
    name: "Teste",
    description: "",
    role: "operator",
    version: 1,
    active: true,
    items: [
      {
        id: randomUUID(),
        description: "Item obrigatório",
        order: 0,
        required: true,
      },
      {
        id: randomUUID(),
        description: "Item opcional",
        order: 1,
        required: false,
      },
    ],
  };
  const execution: Execution = {
    id: randomUUID(),
    template,
    userId: user.id,
    userName: user.name,
    storeId: user.storeId!,
    startedAt: "2026-10-27T10:00:00.000Z",
    finishedAt: "2026-10-27T10:05:00.000Z",
    score: 100,
    answers: template.items.map((item) => ({
      id: randomUUID(),
      itemId: item.id,
      value: "C",
      observation: "",
      photos: [],
    })),
    syncStatus: "pending",
  };
  return { user, template, execution };
}
test("pontuação considera somente C e NC, sem fabricar 100% quando não há itens aplicáveis", () => {
  assert.equal(
    scoreAnswers([
      { value: "C" },
      { value: "NC" },
      { value: "NA" },
      { value: null },
    ]),
    50,
  );
  assert.equal(scoreAnswers([{ value: "C" }, { value: "C" }]), 100);
  assert.equal(scoreAnswers([{ value: "NC" }, { value: "NC" }]), 0);
  assert.equal(scoreAnswers([{ value: "NA" }, { value: null }]), null);
  assert.equal(scoreAnswers([]), null);
  assert.equal(
    scoreAnswers([{ value: "C" }, { value: "NC" }, { value: "NC" }]),
    33.33,
  );
});
test("obrigatório aceita NA, opcional pode ficar vazio, NC opcional exige foto", () => {
  const { execution } = fixture();
  execution.answers[0].value = "NA";
  execution.answers[1].value = null;
  assert.deepEqual(executionErrors(execution), {});
  execution.answers[0].value = null;
  assert.ok(executionErrors(execution)[execution.answers[0].itemId]);
  execution.answers[0].value = "C";
  execution.answers[1].value = "NC";
  assert.ok(executionErrors(execution)[execution.answers[1].itemId]);
  execution.answers[1].photos = [
    { id: randomUUID(), contentType: "image/png", size: 20 },
  ];
  assert.deepEqual(executionErrors(execution), {});
});
test("servidor usa modelo canônico e recalcula nota; metadados de UI não alteram idempotência", () => {
  const { user, template, execution } = fixture();
  execution.score = 3;
  execution.userName = "Nome falsificado";
  execution.template = { ...template, name: "Modelo falso" };
  const saved = validatedExecution(execution, template, user);
  assert.equal(saved.score, 100);
  assert.equal(saved.userName, user.name);
  assert.equal(saved.template.name, template.name);
  assert.equal(
    executionHash(saved),
    executionHash({
      ...saved,
      syncStatus: "synced",
      syncError: "erro anterior",
      userName: "nome atualizado",
    }),
  );
  assert.equal(
    executionHash(saved),
    executionHash(
      validatedExecution(
        { ...execution, answers: [...execution.answers].reverse() },
        template,
        user,
      ),
    ),
  );
});
test("rejeita autor/loja falsificados, respostas duplicadas e item fora da versão", () => {
  const { user, template, execution } = fixture();
  assert.throws(() =>
    validatedExecution({ ...execution, userId: randomUUID() }, template, user),
  );
  assert.throws(() =>
    validatedExecution({ ...execution, storeId: randomUUID() }, template, user),
  );
  assert.throws(() =>
    validatedExecution(
      { ...execution, answers: [execution.answers[0], execution.answers[0]] },
      template,
      user,
    ),
  );
  assert.throws(() =>
    validatedExecution(
      {
        ...execution,
        answers: [{ ...execution.answers[0], itemId: randomUUID() }],
      },
      template,
      user,
    ),
  );
});
test("permissões por cargo e loja não dependem do frontend", () => {
  const { user } = fixture();
  assert.equal(canExecute("operator", "operator"), true);
  assert.equal(canExecute("operator", "manager"), false);
  assert.equal(canExecute("manager", "operator"), true);
  assert.equal(canExecute("manager", "manager"), true);
  assert.equal(canExecute("admin", "operator"), false);
  assert.equal(canSeeStore(user, user.storeId!), true);
  assert.equal(canSeeStore(user, randomUUID()), false);
});
test("prazo é 24h após finalização, não após sincronização", () => {
  assert.equal(
    actionDueAt("2026-10-27T23:30:00.000Z"),
    "2026-10-28T23:30:00.000Z",
  );
});
