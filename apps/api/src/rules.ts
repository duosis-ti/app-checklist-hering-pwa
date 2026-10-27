import { createHash } from 'node:crypto';
import type { Execution, Role, Template, User } from '@checklist/shared';
import { executionErrors, scoreAnswers } from '@checklist/shared';
import { HttpError, assert } from './errors.js';
export function canExecute(role: Role, templateRole: Template['role']) { return role === 'manager' || role === templateRole; }
export function canSeeStore(user: User, storeId: string) { return user.role === 'admin' || user.storeId === storeId; }
export function assertStore(user: User, storeId: string) { assert(canSeeStore(user, storeId), 404, 'Registro não encontrado.'); }
export function validatedExecution(input: Execution, template: Template, user: User): Execution {
 assert(user.role !== 'admin' && canExecute(user.role, template.role), 403, 'Seu cargo não pode executar este modelo.');
 assert(input.userId === user.id && input.storeId === user.storeId, 403, 'Esta execução não pertence ao seu usuário e loja.');
 assert(input.finishedAt && Date.parse(input.finishedAt) >= Date.parse(input.startedAt), 422, 'Data de finalização inválida.');
 const itemIds = new Set(template.items.map(item => item.id));
 assert(input.answers.every(answer => itemIds.has(answer.itemId)), 422, 'A execução contém um item que não pertence ao modelo.');
 assert(new Set(input.answers.map(answer => answer.itemId)).size === input.answers.length, 422, 'Há respostas duplicadas para um item.');
 assert(new Set(input.answers.map(answer => answer.id)).size === input.answers.length, 422, 'Há identificadores de resposta duplicados.');
 const photos = input.answers.flatMap(answer => answer.photos);
 assert(new Set(photos.map(photo => photo.id)).size === photos.length, 422, 'Há identificadores de foto duplicados.');
 const result: Execution = {
  id: input.id, template, userId: user.id, storeId: user.storeId!, userName: user.name,
  startedAt: new Date(input.startedAt).toISOString(), finishedAt: new Date(input.finishedAt!).toISOString(),
  score: scoreAnswers(input.answers), syncStatus: 'pending',
  answers: input.answers.map(answer => ({
   id: answer.id, itemId: answer.itemId, value: answer.value, observation: answer.observation,
   photos: answer.photos.map(photo => ({ id: photo.id, contentType: photo.contentType, size: photo.size })).sort((a,b) => a.id.localeCompare(b.id))
  })).sort((a,b) => a.itemId.localeCompare(b.itemId))
 };
 const errors = executionErrors(result);
 if (Object.keys(errors).length) throw new HttpError(422, 'Revise os itens antes de finalizar.', errors);
 return result;
}
export function executionHash(execution: Execution) {
 const { syncStatus: _status, syncError: _error, userName: _name, ...content } = execution;
 return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
export function actionDueAt(finishedAt: string) { return new Date(Date.parse(finishedAt) + 24 * 60 * 60 * 1000).toISOString(); }
