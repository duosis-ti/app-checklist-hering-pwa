import { z } from "zod";
export const uuid = z.uuid();
export const photoSchema = z.object({
  id: uuid,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  url: z.string().optional(),
});
export const templateBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).default(""),
    role: z.enum(["operator", "manager"]),
    active: z.boolean().default(true),
    items: z
      .array(
        z.object({
          id: uuid,
          description: z.string().trim().min(1).max(1000),
          order: z.number().int().min(0),
          required: z.boolean(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.id)).size === value.items.length,
    { message: "Cada item deve ter um identificador diferente." },
  )
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.order)).size ===
      value.items.length,
    { message: "Cada item deve ter uma ordem diferente." },
  );
export const executionSchema = z.object({
  id: uuid,
  template: z
    .object({ id: uuid, version: z.number().int().positive() })
    .passthrough(),
  storeId: uuid,
  userId: uuid,
  userName: z.string().max(200),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  score: z.number().nullable(),
  syncStatus: z.enum(["pending", "syncing", "synced", "error"]),
  syncError: z.string().optional(),
  answers: z
    .array(
      z.object({
        id: uuid,
        itemId: uuid,
        value: z.enum(["C", "NC", "NA"]).nullable(),
        observation: z.string().max(4000),
        photos: z.array(photoSchema).max(5),
      }),
    )
    .max(100),
});
export const updateActionSchema = z.object({
  status: z.literal("in_progress"),
  version: z.number().int().positive(),
  photos: z.array(photoSchema).max(5).optional(),
});
export const completeActionSchema = z.object({
  version: z.number().int().positive(),
  photos: z.array(photoSchema).min(1).max(5),
});
