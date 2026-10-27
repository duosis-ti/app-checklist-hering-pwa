import type { ActionPlan, Execution, PhotoMeta } from '@checklist/shared';
import { pool } from './db.js';
import { photoUrl } from './storage.js';
export async function publicPhoto(row: any): Promise<PhotoMeta> {
 return { id: row.id, contentType: row.content_type, size: row.size_bytes, ...(row.confirmed ? {url: await photoUrl(row)} : {}) };
}
export async function executionView(row: any): Promise<Execution> {
 const snapshot = structuredClone(row.snapshot) as Execution;
 const photos = (await pool.query('SELECT p.* FROM photos p JOIN responses r ON r.id=p.response_id WHERE r.execution_id=$1',[row.id])).rows;
 const byId = new Map(await Promise.all(photos.map(async p => [p.id, await publicPhoto(p)] as const)));
 return { ...snapshot, score: row.score === null ? null : Number(row.score), syncStatus: row.synced_at ? 'synced' : 'pending', answers: snapshot.answers.map(answer => ({...answer,photos:answer.photos.map(photo => byId.get(photo.id) ?? photo)})) };
}
export async function actionView(row: any): Promise<ActionPlan> {
 const photos = (await pool.query('SELECT * FROM photos WHERE action_id=$1 AND confirmed ORDER BY created_at,id',[row.id])).rows;
 const source = (await pool.query('SELECT * FROM photos WHERE response_id=$1 AND confirmed ORDER BY created_at,id',[row.response_id])).rows;
 return {
  id:row.id,responseId:row.response_id,executionId:row.execution_id,storeId:row.store_id,description:row.description,
  responsibleId:row.responsible_id,responsibleName:row.responsible_name,dueAt:new Date(row.due_at).toISOString(),
  status:row.status,version:row.version,completedAt:row.completed_at ? new Date(row.completed_at).toISOString() : null,
  photos:await Promise.all(photos.map(publicPhoto)),sourcePhotos:await Promise.all(source.map(publicPhoto))
 };
}
export const actionSelect = 'SELECT a.*, u.name AS responsible_name FROM action_plans a JOIN users u ON u.id=a.responsible_id';
