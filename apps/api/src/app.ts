import { createHash, randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Execution, PhotoMeta, Template } from '@checklist/shared';
import { pool, transaction } from './db.js';
import { authenticate, adminOnly, managerOnly, signSession, userFromRow } from './auth.js';
import { HttpError, assert } from './errors.js';
import { executionSchema, templateBody, uuid, photoSchema, updateActionSchema, completeActionSchema } from './schemas.js';
import { validatedExecution, executionHash, assertStore, actionDueAt } from './rules.js';
import { uploadTicket, photoKey, verifyPhoto } from './storage.js';
import { actionSelect, actionView, executionView } from './data.js';
import { openApi } from './openapi.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit:'2mb' }));
app.get('/api/health', async (_req,res) => { await pool.query('SELECT 1'); res.json({status:'ok'}); });
app.get('/api/openapi.json', (_req,res) => res.json(openApi));
app.get('/api/docs', (_req,res) => res.type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Checklist API</title><h1>Checklist API</h1><p>Documentação OpenAPI 3.1: <a href="/api/openapi.json">abrir especificação JSON</a>.</p><p>Use o token Bearer retornado em /api/auth/login nos endpoints protegidos.</p></html>'));
const loginAttempts = new Map<string,{ count:number; until:number }>();
app.post('/api/auth/login', async (req,res) => {
 const input = z.object({email:z.email().max(254),password:z.string().min(1).max(200)}).parse(req.body);
 const email = input.email.trim().toLowerCase();
 const key = `${req.ip}:${email}`;
 const attempts = loginAttempts.get(key);
 if (attempts && attempts.until > Date.now() && attempts.count >= 20) throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');
 const result = await pool.query('SELECT u.*, s.name AS store_name FROM users u LEFT JOIN stores s ON s.id=u.store_id WHERE u.email=$1 AND u.active AND (s.id IS NULL OR s.active)',[email]);
 if (!result.rows[0] || !(await bcrypt.compare(input.password,result.rows[0].password_hash))) {
  const previous = attempts && attempts.until > Date.now() ? attempts.count : 0;
  loginAttempts.set(key,{count:previous+1,until:Date.now()+15*60*1000});
  if (loginAttempts.size > 10000) for (const [k,value] of loginAttempts) if (value.until < Date.now()) loginAttempts.delete(k);
  throw new HttpError(401,'E-mail ou senha incorretos.');
 }
 loginAttempts.delete(key); res.json(signSession(userFromRow(result.rows[0])));
});
app.use('/api',authenticate);
app.get('/api/auth/me', (req,res) => res.json(req.user));

app.get('/api/templates', async (req,res) => {
 const {rows} = await pool.query(`SELECT t.active,v.payload FROM templates t JOIN template_versions v ON v.template_id=t.id AND v.version=t.current_version ${req.user.role === 'admin' ? '' : "WHERE t.active AND ($1='manager' OR v.payload->>'role'=$1)"} ORDER BY v.payload->>'name'`,req.user.role === 'admin' ? [] : [req.user.role]);
 res.json(rows.map(row => ({...row.payload,active:row.active})));
});
app.post('/api/templates',adminOnly, async (req,res) => {
 const input = templateBody.parse(req.body);
 const template: Template = {...input,id:randomUUID(),version:1,items:input.items.sort((a,b)=>a.order-b.order)};
 await transaction(async db => {
  await db.query('INSERT INTO templates(id,current_version,active) VALUES($1,1,$2)',[template.id,template.active]);
  await db.query('INSERT INTO template_versions(template_id,version,payload) VALUES($1,1,$2)',[template.id,template]);
 });
 res.status(201).json(template);
});
app.put('/api/templates/:id',adminOnly, async (req,res) => {
 const id=uuid.parse(req.params.id),input=templateBody.parse(req.body);
 const template = await transaction(async db => {
  const current=(await db.query('SELECT * FROM templates WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(current,404,'Modelo não encontrado.');
  const next: Template={...input,id,version:current.current_version+1,items:input.items.sort((a,b)=>a.order-b.order)};
  await db.query('INSERT INTO template_versions(template_id,version,payload) VALUES($1,$2,$3)',[id,next.version,next]);
  await db.query('UPDATE templates SET current_version=$2,active=$3 WHERE id=$1',[id,next.version,next.active]);
  return next;
 });
 res.json(template);
});
app.patch('/api/templates/:id',adminOnly, async(req,res)=>{
 const id=uuid.parse(req.params.id),{active}=z.object({active:z.boolean()}).parse(req.body);
 const result=await pool.query('UPDATE templates SET active=$2 WHERE id=$1 RETURNING current_version',[id,active]);
 assert(result.rowCount,404,'Modelo não encontrado.');
 const {rows}=await pool.query('SELECT payload FROM template_versions WHERE template_id=$1 AND version=$2',[id,result.rows[0].current_version]);
 res.json({...rows[0].payload,active});
});

app.put('/api/sync/executions/:id',async(req,res)=>{
 const id=uuid.parse(req.params.id),input=executionSchema.parse(req.body);
 assert(id===input.id,422,'Identificador de execução inválido.');
 const version=(await pool.query('SELECT payload FROM template_versions WHERE template_id=$1 AND version=$2',[input.template.id,input.template.version])).rows[0];
 assert(version,422,'A versão deste modelo não está disponível.');
 const execution=validatedExecution(input as unknown as Execution,version.payload,req.user);
 const hash=executionHash(execution);
 const state=await transaction(async db=>{
  await db.query('INSERT INTO executions(id,template_id,template_version,store_id,user_id,snapshot,payload_hash,score,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING',[
   id,execution.template.id,execution.template.version,execution.storeId,execution.userId,execution,hash,execution.score,execution.startedAt,execution.finishedAt
  ]);
  const existing=(await db.query('SELECT * FROM executions WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(existing.user_id===req.user.id && existing.store_id===req.user.storeId,404,'Execução não encontrada.');
  assert(existing.payload_hash===hash,409,'Esta execução já foi enviada com dados diferentes. O original foi preservado.');
  for(const answer of execution.answers){
   const item=execution.template.items.find(item=>item.id===answer.itemId)!;
   await db.query('INSERT INTO responses(id,execution_id,item_id,item_description,value,observation) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[answer.id,id,answer.itemId,item.description,answer.value,answer.observation]);
   const saved=(await db.query('SELECT execution_id,item_id FROM responses WHERE id=$1',[answer.id])).rows[0];
   assert(saved.execution_id===id && saved.item_id===answer.itemId,409,'Identificador de resposta já utilizado.');
   for(const photo of answer.photos){
    const key=photoKey(execution.storeId,'execucoes',id,photo.id,photo.contentType);
    await db.query('INSERT INTO photos(id,response_id,store_id,storage_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[photo.id,answer.id,execution.storeId,key,photo.contentType,photo.size]);
    const savedPhoto=(await db.query('SELECT * FROM photos WHERE id=$1',[photo.id])).rows[0];
    assert(savedPhoto.response_id===answer.id && savedPhoto.storage_key===key && savedPhoto.content_type===photo.contentType && savedPhoto.size_bytes===photo.size,409,'Identificador de foto já utilizado.');
   }
  }
  const photos=(await db.query('SELECT p.* FROM photos p JOIN responses r ON r.id=p.response_id WHERE r.execution_id=$1 AND NOT p.confirmed',[id])).rows;
  return {synced:Boolean(existing.synced_at),photos};
 });
 res.json({synced:state.synced,uploads:await Promise.all(state.photos.map(uploadTicket))});
});

app.post('/api/sync/executions/:id/commit',async(req,res)=>{
 const id=uuid.parse(req.params.id);
 const row=await transaction(async db=>{
  const execution=(await db.query('SELECT * FROM executions WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(execution && execution.user_id===req.user.id && execution.store_id===req.user.storeId,404,'Execução não encontrada.');
  if(execution.synced_at)return execution;
  const photos=(await db.query('SELECT p.* FROM photos p JOIN responses r ON r.id=p.response_id WHERE r.execution_id=$1',[id])).rows;
  for(const photo of photos)if(!photo.confirmed){await verifyPhoto(photo);await db.query('UPDATE photos SET confirmed=true WHERE id=$1',[photo.id]);}
  const failures=(await db.query("SELECT * FROM responses WHERE execution_id=$1 AND value='NC'",[id])).rows;
  if(failures.length){
   const manager=(await db.query("SELECT id FROM users WHERE store_id=$1 AND role_id='manager' AND active ORDER BY id LIMIT 1",[execution.store_id])).rows[0];
   assert(manager,422,'A loja precisa de um gerente ativo para receber os planos de ação.');
   for(const response of failures){
    const description=`Corrigir: ${response.item_description}${response.observation ? `. ${response.observation}`:''}`;
    await db.query('INSERT INTO action_plans(id,response_id,execution_id,store_id,description,responsible_id,due_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(response_id) DO NOTHING',[randomUUID(),response.id,id,execution.store_id,description,manager.id,actionDueAt(new Date(execution.finished_at).toISOString())]);
   }
  }
  return (await db.query('UPDATE executions SET synced_at=now() WHERE id=$1 RETURNING *',[id])).rows[0];
 });
 res.json(await executionView(row));
});

app.get('/api/executions',async(req,res)=>{
 const {rows}=await pool.query(`SELECT * FROM executions WHERE synced_at IS NOT NULL ${req.user.role==='admin'?'':'AND store_id=$1'} ORDER BY finished_at DESC LIMIT 200`,req.user.role==='admin'?[]:[req.user.storeId]);
 res.json(await Promise.all(rows.map(executionView)));
});
app.get('/api/executions/:id',async(req,res)=>{
 const row=(await pool.query('SELECT * FROM executions WHERE id=$1',[uuid.parse(req.params.id)])).rows[0];
 assert(row,404,'Execução não encontrada.');assertStore(req.user,row.store_id);
 res.json(await executionView(row));
});
app.get('/api/actions',async(req,res)=>{
 assert(req.user.role!=='operator',403,'Somente gerentes e administradores podem consultar os planos.');
 const {rows}=await pool.query(`${actionSelect} ${req.user.role==='admin'?'':'WHERE a.store_id=$1'} ORDER BY a.status='completed',a.due_at LIMIT 200`,req.user.role==='admin'?[]:[req.user.storeId]);
 res.json(await Promise.all(rows.map(actionView)));
});
app.patch('/api/actions/:id',managerOnly,async(req,res)=>{
 const id=uuid.parse(req.params.id),input=updateActionSchema.parse(req.body);
 await transaction(async db=>{
  const row=(await db.query('SELECT * FROM action_plans WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(row,404,'Plano de ação não encontrado.');assertStore(req.user,row.store_id);
  if(row.status==='in_progress' && (input.version===row.version || input.version===row.version-1))return;
  assert(row.version===input.version,409,'Este plano foi atualizado. Recarregue para ver a versão atual.');
  assert(row.status!=='completed',409,'Este plano já foi concluído.');
  await db.query("UPDATE action_plans SET status='in_progress',version=version+1,updated_at=now() WHERE id=$1",[id]);
 });
 res.json(await actionView((await pool.query(`${actionSelect} WHERE a.id=$1`,[id])).rows[0]));
});
app.post('/api/actions/:id/photos',managerOnly,async(req,res)=>{
 const id=uuid.parse(req.params.id),input=photoSchema.parse(req.body);
 const photo=await transaction(async db=>{
  const row=(await db.query('SELECT * FROM action_plans WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(row,404,'Plano de ação não encontrado.');assertStore(req.user,row.store_id);
  assert(row.status!=='completed',409,'Este plano já foi concluído.');
  const key=photoKey(row.store_id,'planos',id,input.id,input.contentType);
  await db.query('INSERT INTO photos(id,action_id,store_id,storage_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[input.id,id,row.store_id,key,input.contentType,input.size]);
  const saved=(await db.query('SELECT * FROM photos WHERE id=$1',[input.id])).rows[0];
  assert(saved.action_id===id && saved.content_type===input.contentType && saved.size_bytes===input.size,409,'Identificador de foto já utilizado.');
  return saved;
 });
 res.json(await uploadTicket(photo));
});
app.post('/api/actions/:id/complete',managerOnly,async(req,res)=>{
 const id=uuid.parse(req.params.id),input=completeActionSchema.parse(req.body);
 assert(new Set(input.photos.map(photo=>photo.id)).size===input.photos.length,422,'Há fotos duplicadas.');
 const hash=createHash('sha256').update(JSON.stringify({version:input.version,photos:input.photos.map(({id,contentType,size})=>({id,contentType,size})).sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
 await transaction(async db=>{
  const row=(await db.query('SELECT * FROM action_plans WHERE id=$1 FOR UPDATE',[id])).rows[0];
  assert(row,404,'Plano de ação não encontrado.');assertStore(req.user,row.store_id);
  if(row.status==='completed' && row.completion_hash===hash)return;
  assert(row.version===input.version && row.status!=='completed',409,'Este plano foi atualizado. Recarregue para ver a versão atual.');
  for(const expected of input.photos){
   const photo=(await db.query('SELECT * FROM photos WHERE id=$1 AND action_id=$2',[expected.id,id])).rows[0];
   assert(photo && photo.size_bytes===expected.size && photo.content_type===expected.contentType,422,'Envie a evidência antes de concluir.');
   await verifyPhoto(photo);await db.query('UPDATE photos SET confirmed=true WHERE id=$1',[photo.id]);
  }
  await db.query("UPDATE action_plans SET status='completed',version=version+1,completed_at=now(),updated_at=now(),completion_hash=$2 WHERE id=$1",[id,hash]);
 });
 res.json(await actionView((await pool.query(`${actionSelect} WHERE a.id=$1`,[id])).rows[0]));
});
app.use((_req,_res,next)=>next(new HttpError(404,'Recurso não encontrado.')));
const handleError:ErrorRequestHandler=(error,_req,res,_next)=>{
 if(error instanceof z.ZodError){res.status(422).json({message:'Confira os dados informados.',details:z.flattenError(error)});return;}
 if(error instanceof HttpError){res.status(error.status).json({message:error.message,...(error.details?{details:error.details}:{})});return;}
 if(error.type==='entity.parse.failed'){res.status(400).json({message:'JSON inválido.'});return;}
 if(error.type==='entity.too.large'){res.status(413).json({message:'Os dados ultrapassaram o limite permitido.'});return;}
 if(error.code==='23505'){res.status(409).json({message:'Um identificador já está em uso. Os dados existentes foram preservados.'});return;}
 console.error('API error:',error.message);
 res.status(500).json({message:'Não foi possível concluir agora. Seus dados salvos no aparelho foram preservados.'});
};
app.use(handleError);
