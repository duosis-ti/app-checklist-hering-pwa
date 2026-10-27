import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { Template } from "@checklist/shared";
import { pool, transaction } from "./db.js";
import { migrate } from "./migrate.js";
const id = (group: number, n: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function seed() {
  const passwordHash = await bcrypt.hash(
    process.env.SEED_PASSWORD ?? "Checklist@123",
    12,
  );
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO roles(id,name) VALUES ('admin','Administrador'),('manager','Gerente'),('operator','Operador') ON CONFLICT DO NOTHING",
    );
    for (const [n, code, name, city, state] of [
      [1, "BLU-01", "Hering Blumenau", "Blumenau", "SC"],
      [2, "SAO-01", "Hering São Paulo", "São Paulo", "SP"],
    ] as const) {
      await db.query(
        "INSERT INTO stores(id,code,name,city,state) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [id(1, n), code, name, city, state],
      );
    }
    const users = [
      [1, "Administrador", "admin@hering.local", "admin", null],
      [2, "Marina Silva", "gerente@hering.local", "manager", id(1, 1)],
      [3, "João Santos", "operador@hering.local", "operator", id(1, 1)],
      [4, "Ana Costa", "gerente2@hering.local", "manager", id(1, 2)],
      [5, "Lucas Oliveira", "operador2@hering.local", "operator", id(1, 2)],
    ];
    for (const [n, name, email, role, store] of users)
      await db.query(
        "INSERT INTO users(id,name,email,password_hash,role_id,store_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [id(2, n as number), name, email, passwordHash, role, store],
      );
    const templates: Template[] = [
      {
        id: id(3, 1),
        name: "Abertura da loja",
        description: "Prepare a loja para receber os clientes.",
        role: "operator",
        active: true,
        version: 1,
        items: [
          {
            id: id(4, 1),
            description: "Alarme desativado e acesso liberado",
            order: 0,
            required: true,
          },
          {
            id: id(4, 2),
            description: "Vitrine limpa e organizada",
            order: 1,
            required: true,
          },
          {
            id: id(4, 3),
            description: "Provadores limpos e desocupados",
            order: 2,
            required: true,
          },
          {
            id: id(4, 4),
            description: "Iluminação funcionando",
            order: 3,
            required: true,
          },
          {
            id: id(4, 5),
            description: "Material de campanha atualizado",
            order: 4,
            required: false,
          },
        ],
      },
      {
        id: id(3, 2),
        name: "Fechamento da loja",
        description: "Confira os cuidados antes de encerrar o dia.",
        role: "operator",
        active: true,
        version: 1,
        items: [
          {
            id: id(4, 6),
            description: "Produtos organizados nas araras",
            order: 0,
            required: true,
          },
          {
            id: id(4, 7),
            description: "Equipamentos desligados",
            order: 1,
            required: true,
          },
          {
            id: id(4, 8),
            description: "Portas e acessos conferidos",
            order: 2,
            required: true,
          },
          {
            id: id(4, 9),
            description: "Alarme ativado",
            order: 3,
            required: true,
          },
        ],
      },
    ];
    for (const template of templates) {
      const created = await db.query(
        "INSERT INTO templates(id,current_version) VALUES($1,1) ON CONFLICT DO NOTHING RETURNING id",
        [template.id],
      );
      if (created.rowCount)
        await db.query(
          "INSERT INTO template_versions(template_id,version,payload) VALUES($1,1,$2)",
          [template.id, template],
        );
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  migrate()
    .then(seed)
    .then(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
      void pool.end();
    });
