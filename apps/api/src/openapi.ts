const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (schema: unknown) => ({
  "200": {
    description: "Operação concluída.",
    content: { "application/json": { schema } },
  },
  "401": { description: "Sessão inválida." },
  "403": { description: "Perfil sem permissão." },
  "404": { description: "Registro não encontrado." },
  "409": {
    description: "Conflito: dados já enviados ou versão desatualizada.",
  },
  "422": { description: "Dados inválidos." },
});
const body = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});
const idParam = [
  {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
];
const object = (
  properties: Record<string, unknown>,
  required: string[] = Object.keys(properties),
) => ({ type: "object", properties, required });
const str = { type: "string" },
  uuid = { type: "string", format: "uuid" },
  date = { type: "string", format: "date-time" };
export const openApi = {
  openapi: "3.1.0",
  info: {
    title: "Checklist de lojas API",
    version: "1.0.0",
    description:
      "API com isolamento por loja, versões imutáveis e sincronização idempotente. Datas em UTC. Fotos até 15 MB, JPEG/PNG/WebP. Score = C/(C+NC); sem itens aplicáveis, null. Login inicial exige conexão.",
  },
  servers: [{ url: "/api" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        summary: "Verifica API e banco",
        security: [],
        responses: response(object({ status: str })),
      },
    },
    "/auth/login": {
      post: {
        summary: "Entrar por e-mail e senha",
        security: [],
        requestBody: body(
          object({ email: { type: "string", format: "email" }, password: str }),
        ),
        responses: response(ref("Session")),
      },
    },
    "/auth/me": {
      get: {
        summary: "Usuário autenticado e loja",
        responses: response(ref("User")),
      },
    },
    "/templates": {
      get: {
        summary: "Modelos disponíveis para o cargo; administrador vê inativos",
        responses: response({ type: "array", items: ref("Template") }),
      },
      post: {
        summary: "Administrador cria modelo",
        requestBody: body(ref("TemplateInput")),
        responses: {
          ...response(ref("Template")),
          "201": {
            description: "Modelo criado.",
            content: { "application/json": { schema: ref("Template") } },
          },
        },
      },
    },
    "/templates/{id}": {
      parameters: idParam,
      put: {
        summary: "Administrador publica nova versão imutável",
        requestBody: body(ref("TemplateInput")),
        responses: response(ref("Template")),
      },
      patch: {
        summary: "Administrador ativa/desativa modelo",
        requestBody: body(object({ active: { type: "boolean" } })),
        responses: response(ref("Template")),
      },
    },
    "/executions": {
      get: {
        summary: "Histórico da loja (últimas 200 execuções)",
        responses: response({ type: "array", items: ref("Execution") }),
      },
    },
    "/executions/{id}": {
      parameters: idParam,
      get: {
        summary: "Detalhe e URLs temporárias de fotos",
        responses: response(ref("Execution")),
      },
    },
    "/sync/executions/{id}": {
      parameters: idParam,
      put: {
        summary:
          "Prepara execução imutável; UUID idempotente e resposta com uploads pendentes",
        requestBody: body(ref("Execution")),
        responses: response(
          object({
            synced: { type: "boolean" },
            uploads: { type: "array", items: ref("UploadTicket") },
          }),
        ),
      },
    },
    "/sync/executions/{id}/commit": {
      parameters: idParam,
      post: {
        summary:
          "Verifica fotos no storage, gera uma ação por NC e confirma execução; idempotente",
        responses: response(ref("Execution")),
      },
    },
    "/actions": {
      get: {
        summary: "Planos da loja; gerente ou administrador",
        responses: response({ type: "array", items: ref("ActionPlan") }),
      },
    },
    "/actions/{id}": {
      parameters: idParam,
      patch: {
        summary: "Gerente inicia ação com controle de versão",
        requestBody: body(
          object({
            status: { const: "in_progress" },
            version: { type: "integer", minimum: 1 },
          }),
        ),
        responses: response(ref("ActionPlan")),
      },
    },
    "/actions/{id}/photos": {
      parameters: idParam,
      post: {
        summary:
          "Prepara evidência da correção; enviar arquivo para URL retornada",
        requestBody: body(ref("PhotoMeta")),
        responses: response(ref("UploadTicket")),
      },
    },
    "/actions/{id}/complete": {
      parameters: idParam,
      post: {
        summary:
          "Conclui ação após verificar evidência, com controle de versão e reenvio idempotente",
        requestBody: body(
          object({
            version: { type: "integer", minimum: 1 },
            photos: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: ref("PhotoMeta"),
            },
          }),
        ),
        responses: response(ref("ActionPlan")),
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      User: object({
        id: uuid,
        name: str,
        email: str,
        role: { enum: ["admin", "manager", "operator"] },
        storeId: { type: ["string", "null"] },
        storeName: { type: ["string", "null"] },
      }),
      Session: object({ token: str, user: ref("User") }),
      TemplateItem: object({
        id: uuid,
        description: str,
        order: { type: "integer" },
        required: { type: "boolean" },
      }),
      TemplateInput: object({
        name: str,
        description: str,
        role: { enum: ["operator", "manager"] },
        active: { type: "boolean" },
        items: { type: "array", minItems: 1, items: ref("TemplateItem") },
      }),
      Template: {
        allOf: [
          ref("TemplateInput"),
          object({ id: uuid, version: { type: "integer", minimum: 1 } }),
        ],
      },
      PhotoMeta: object(
        {
          id: uuid,
          contentType: { enum: ["image/jpeg", "image/png", "image/webp"] },
          size: { type: "integer", minimum: 1, maximum: 15728640 },
          url: str,
        },
        ["id", "contentType", "size"],
      ),
      Answer: object({
        id: uuid,
        itemId: uuid,
        value: { enum: ["C", "NC", "NA", null] },
        observation: str,
        photos: { type: "array", maxItems: 5, items: ref("PhotoMeta") },
      }),
      Execution: object({
        id: uuid,
        template: ref("Template"),
        storeId: uuid,
        userId: uuid,
        userName: str,
        startedAt: date,
        finishedAt: date,
        score: { type: ["number", "null"] },
        answers: { type: "array", items: ref("Answer") },
        syncStatus: { enum: ["pending", "syncing", "synced", "error"] },
      }),
      UploadTicket: object({
        photoId: uuid,
        url: str,
        headers: { type: "object", additionalProperties: { type: "string" } },
      }),
      ActionPlan: object({
        id: uuid,
        responseId: uuid,
        executionId: uuid,
        storeId: uuid,
        description: str,
        responsibleId: uuid,
        responsibleName: str,
        dueAt: date,
        status: { enum: ["open", "in_progress", "completed"] },
        version: { type: "integer" },
        completedAt: { type: ["string", "null"] },
        photos: { type: "array", items: ref("PhotoMeta") },
        sourcePhotos: { type: "array", items: ref("PhotoMeta") },
      }),
    },
  },
};
