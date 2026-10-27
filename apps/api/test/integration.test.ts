import '../src/env.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Execution, Session, Template } from '@checklist/shared';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { app } from '../src/app.js';
import { pool, transaction } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { bucket, ensureBucket, s3 } from '../src/storage.js';
const enabled=process.env.RUN_INTEGRATION==='1';
let server:Server,base:string;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==','base64');
async function request(path:string,method='GET',token?:string,body?:unknown){
 const response=await fetch(`${base}${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json() as any};
}
async function login(email:string):Promise<Session>{const result=await request('/auth/login','POST',undefined,{email,password:process.env.SEED_PASSWORD??'Checklist@123'});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
async function upload(ticket:any){
 const url=ticket.url.startsWith('/storage/')?`${process.env.S3_ENDPOINT??'http://localhost:8333'}${ticket.url.slice('/storage'.length)}`:ticket.url;
 const result=await fetch(url,{method:'PUT',headers:ticket.headers,body:png});assert.ok(result.ok,`upload ${result.status}: ${await result.text()}`);
}
async function cleanupTemplate(templateId:string){
 const objects=await transaction(async db=>{
  const executions=(await db.query('SELECT id FROM executions WHERE template_id=$1',[templateId])).rows.map(row=>row.id);
  const keys=(await db.query('DELETE FROM photos WHERE response_id IN (SELECT id FROM responses WHERE execution_id=ANY($1::uuid[])) OR action_id IN (SELECT id FROM action_plans WHERE execution_id=ANY($1::uuid[])) RETURNING storage_key',[executions])).rows;
  await db.query('DELETE FROM action_plans WHERE execution_id=ANY($1::uuid[])',[executions]);
  await db.query('DELETE FROM responses WHERE execution_id=ANY($1::uuid[])',[executions]);
  await db.query('DELETE FROM executions WHERE template_id=$1',[templateId]);
  await db.query('DELETE FROM template_versions WHERE template_id=$1',[templateId]);
  await db.query('DELETE FROM templates WHERE id=$1',[templateId]);
  return keys;
 });
 await Promise.all(objects.map(row=>s3.send(new DeleteObjectCommand({Bucket:bucket,Key:row.storage_key}))));
}
before(async()=>{
 if(!enabled)return;
 await migrate();await seed();await ensureBucket();
 await new Promise<void>((resolve,reject)=>{server=app.listen(0,'127.0.0.1',(error?:Error)=>error?reject(error):resolve());});
 base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();});
test('integração: isolamento, versão histórica, sync concorrente, fotos e plano idempotentes',{skip:!enabled},async()=>{
 const [admin,operator,manager,otherManager]=await Promise.all(['admin@hering.local','operador@hering.local','gerente@hering.local','gerente2@hering.local'].map(login));
 const model={name:`Integração ${randomUUID()}`,description:'Modelo temporário dos testes',role:'operator',active:true,items:[
  {id:randomUUID(),description:'Conforme',order:0,required:true},{id:randomUUID(),description:'Não conforme',order:1,required:true},
  {id:randomUUID(),description:'Não se aplica',order:2,required:true},{id:randomUUID(),description:'Opcional',order:3,required:false}
 ]};
 assert.equal((await request('/templates','POST',operator.token,model)).status,403);
 const created=await request('/templates','POST',admin.token,model);assert.equal(created.status,201);
 const template=created.body as Template;
 try{
 const execution:Execution={id:randomUUID(),template,storeId:operator.user.storeId!,userId:operator.user.id,userName:operator.user.name,startedAt:new Date(Date.now()-60000).toISOString(),finishedAt:new Date().toISOString(),score:999,syncStatus:'pending',answers:template.items.map((item,i)=>({id:randomUUID(),itemId:item.id,value:(["C","NC","NA",null] as const)[i],observation:i===1?'Precisa de limpeza':'',photos:i===1?[{id:randomUUID(),contentType:'image/png',size:png.length}]:[]}))};
 const modified=await request(`/templates/${template.id}`,'PUT',admin.token,{...model,name:'Modelo editado',items:[...model.items,{id:randomUUID(),description:'Novo obrigatório',order:4,required:true}]});
 assert.equal(modified.status,200);assert.equal(modified.body.version,2);
 const attempts=await Promise.all(Array.from({length:4},()=>request(`/sync/executions/${execution.id}`,'PUT',operator.token,execution)));
 for(const result of attempts)assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(attempts[0].body.uploads.length,1);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM executions WHERE id=$1',[execution.id])).rows[0].n,1);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM responses WHERE execution_id=$1',[execution.id])).rows[0].n,4);
 assert.equal((await request(`/sync/executions/${execution.id}/commit`,'POST',operator.token)).status,409);
 assert.equal((await request('/executions','GET',operator.token)).body.some((row:any)=>row.id===execution.id),false);
 assert.equal((await request(`/executions/${execution.id}`,'GET',otherManager.token)).status,404);
 assert.equal((await request(`/sync/executions/${execution.id}`,'PUT',otherManager.token,execution)).status,403);
 assert.equal((await request(`/sync/executions/${execution.id}/commit`,'POST',otherManager.token)).status,404);
 const changed=structuredClone(execution);changed.answers[0].observation='Alterado';
 assert.equal((await request(`/sync/executions/${execution.id}`,'PUT',operator.token,changed)).status,409);
 await upload(attempts[0].body.uploads[0]);
 const commits=await Promise.all(Array.from({length:3},()=>request(`/sync/executions/${execution.id}/commit`,'POST',operator.token)));
 for(const result of commits){assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.syncStatus,'synced');assert.equal(result.body.score,50);assert.equal(result.body.template.version,1);assert.equal(result.body.template.name,model.name);assert.ok(result.body.answers.find((a:any)=>a.value==='NC').photos[0].url);}
 const retry=await request(`/sync/executions/${execution.id}`,'PUT',operator.token,execution);assert.equal(retry.body.synced,true);assert.deepEqual(retry.body.uploads,[]);
 const actions=(await request('/actions','GET',manager.token)).body.filter((row:any)=>row.executionId===execution.id);assert.equal(actions.length,1);
 const action=actions[0];assert.equal(action.responsibleId,manager.user.id);assert.equal(action.dueAt,new Date(Date.parse(execution.finishedAt!)+86400000).toISOString());
 assert.equal((await request('/actions','GET',operator.token)).status,403);
 assert.equal((await request(`/actions/${action.id}`,'PATCH',otherManager.token,{status:'in_progress',version:1})).status,404);
 const started=await request(`/actions/${action.id}`,'PATCH',manager.token,{status:'in_progress',version:1});assert.equal(started.status,200);assert.equal(started.body.version,2);
 const photo={id:randomUUID(),contentType:'image/png',size:png.length};
 assert.equal((await request(`/actions/${action.id}/photos`,'POST',otherManager.token,photo)).status,404);
 assert.equal((await request(`/actions/${action.id}/complete`,'POST',manager.token,{version:1,photos:[photo]})).status,409);
 const ticket=await request(`/actions/${action.id}/photos`,'POST',manager.token,photo);assert.equal(ticket.status,200);
 assert.equal((await request(`/actions/${action.id}/complete`,'POST',manager.token,{version:2,photos:[photo]})).status,409);
 await upload(ticket.body);
 const done=await request(`/actions/${action.id}/complete`,'POST',manager.token,{version:2,photos:[photo]});assert.equal(done.status,200);assert.equal(done.body.status,'completed');assert.equal(done.body.version,3);assert.equal(done.body.photos.length,1);
 const repeat=await request(`/actions/${action.id}/complete`,'POST',manager.token,{version:2,photos:[photo]});assert.equal(repeat.status,200);assert.equal(repeat.body.version,3);
 const readUrl=commits[0].body.answers.find((a:any)=>a.value==='NC').photos[0].url;
 const directUrl=readUrl.startsWith('/storage/')?`${process.env.S3_ENDPOINT??'http://localhost:8333'}${readUrl.slice('/storage'.length)}`:readUrl;
 assert.ok((await fetch(directUrl)).ok,'URL de leitura deve funcionar');
 const unsignedUrl=new URL(directUrl);unsignedUrl.search='';
 assert.equal((await fetch(unsignedUrl)).status,403,'Storage não deve permitir leitura anônima');
 await request(`/templates/${template.id}`,'PATCH',admin.token,{active:false});
 }finally{await cleanupTemplate(template.id);}
});
