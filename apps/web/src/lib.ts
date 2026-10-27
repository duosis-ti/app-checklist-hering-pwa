import Dexie, { type Table } from 'dexie';
import { executionErrors, scoreAnswers, type Session, type Template, type Execution, type PhotoMeta, type ActionPlan, type PrepareResult, type UploadTicket } from '@checklist/shared';
export * from '@checklist/shared';

interface LocalPhoto { id: string; userId: string; executionId: string; blob: Blob }
interface Catalog { userId: string; templates: Template[]; actions: ActionPlan[] }
class ChecklistDB extends Dexie {
  executions!: Table<Execution, string>;
  photos!: Table<LocalPhoto, string>;
  catalogs!: Table<Catalog, string>;
  constructor() { super('checklist-lojas-v1'); this.version(1).stores({ executions: 'id,userId,storeId,syncStatus', photos:'id,userId,executionId', catalogs:'userId' }); }
}
export const db = new ChecklistDB();
const sessionKey = 'checklist-session-v1';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getSession(): Session | null { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; } }
export function logout() { localStorage.removeItem(sessionKey); notify(); }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? {'Content-Type': 'application/json'} : {}), ...(session ? {Authorization: `Bearer ${session.token}`} : {}), ...options.headers }, signal: options.signal ?? AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || body.error || (response.status === 401 ? 'Entre novamente para enviar seus checklists.' : 'Não foi possível concluir. Tente novamente.'), response.status);
  return body as T;
}
export async function login(email: string, password: string): Promise<Session> {
  const session = await api<Session>('/auth/login', {method:'POST',body:JSON.stringify({email,password})});
  localStorage.setItem(sessionKey, JSON.stringify(session));
  await loadData();
  void navigator.storage?.persist?.().catch(() => false);
  return session;
}
export async function loadData(): Promise<{templates:Template[];executions:Execution[];actions:ActionPlan[]}> {
  const session = getSession(); if (!session) return {templates:[],executions:[],actions:[]};
  const userId = session.user.id;
  let catalog = await db.catalogs.get(userId) ?? {userId, templates:[], actions:[]};
  let remote: Execution[] = [];
  if (navigator.onLine) {
    const results = await Promise.allSettled([
      api<Template[]>('/templates'),
      session.user.role !== 'admin' ? api<Execution[]>('/executions') : Promise.resolve([]),
      session.user.role === 'manager' ? api<ActionPlan[]>('/actions') : Promise.resolve([]),
    ]);
    if (getSession()?.user.id !== userId) return {templates:[],executions:[],actions:[]};
    if (results[0].status === 'fulfilled') catalog.templates = results[0].value;
    if (results[2].status === 'fulfilled') catalog.actions = results[2].value;
    await db.catalogs.put(catalog);
    if (results[1].status === 'fulfilled') {
      remote = results[1].value;
      for (const execution of remote) {
        const local = await db.executions.get(execution.id);
        if (!local || local.syncStatus === 'synced') await db.executions.put({...execution,syncStatus:'synced'});
      }
    }
  }
  const local = (await db.executions.where('storeId').equals(session.user.storeId ?? '').toArray())
    .filter(e => e.userId === userId || e.syncStatus === 'synced');
  return { templates: catalog.templates, executions: local.sort((a,b)=>(b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt)), actions:catalog.actions };
}
export async function createExecution(template: Template): Promise<Execution> {
  const session = getSession(); if (!session?.user.storeId) throw new Error('Entre com um usuário da loja.');
  const execution: Execution = {id:crypto.randomUUID(),template:structuredClone(template),storeId:session.user.storeId,userId:session.user.id,userName:session.user.name,startedAt:new Date().toISOString(),finishedAt:null,score:null,syncStatus:'pending',answers:template.items.map(item=>({id:crypto.randomUUID(),itemId:item.id,value:null,observation:'',photos:[]}))};
  await saveExecution(execution); return execution;
}
export async function saveExecution(execution: Execution) {
  if (execution.userId !== getSession()?.user.id) throw new Error('Esta execução pertence a outro usuário.');
  const current = await db.executions.get(execution.id);
  if (current?.finishedAt) throw new Error('Este checklist já foi finalizado.');
  await db.executions.put(structuredClone(execution));
  notify();
}
export async function finishExecution(execution: Execution): Promise<Execution> {
  if (execution.userId !== getSession()?.user.id) throw new Error('Esta execução pertence a outro usuário.');
  const errors = executionErrors(execution); if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const result: Execution = {...execution,finishedAt:new Date().toISOString(),score:scoreAnswers(execution.answers),syncStatus:'pending'};
  await db.transaction('rw', db.executions, db.photos, async () => {
    const current = await db.executions.get(execution.id);
    if(current?.finishedAt) throw new Error('Este checklist já foi finalizado.');
    for(const answer of execution.answers) for(const photo of answer.photos) {
      const local = await db.photos.get(photo.id);
      if (!local || local.userId !== execution.userId || !local.blob.size) throw new Error('Uma foto não foi salva. Adicione a foto novamente.');
    }
    await db.executions.put(result);
  });
  notify(); void syncNow(); return result;
}
async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem da câmera ou galeria.');
  if(file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto de até 20 MB.');
  try {
    const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
    const ratio = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width=Math.round(bitmap.width*ratio); canvas.height=Math.round(bitmap.height*ratio);
    canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    const compressed = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
    if (compressed) return compressed;
  } catch { /* Preserve supported originals when decoding is unavailable. */ }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use uma foto JPG, PNG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto de até 10 MB.');
  return file;
}
export async function attachPhoto(executionId: string, _itemId: string, file: File): Promise<PhotoMeta> {
  const session=getSession(); if(!session) throw new Error('Entre novamente.');
  const execution = await db.executions.get(executionId);
  if(!execution || execution.userId !== session.user.id || execution.finishedAt) throw new Error('Não é possível alterar este checklist.');
  const blob = await prepareImage(file); const id=crypto.randomUUID();
  try { await db.photos.put({id,executionId,userId:session.user.id,blob}); }
  catch { throw new Error('Não foi possível salvar a foto. Libere espaço e tente novamente.'); }
  return {id,contentType:blob.type,size:blob.size};
}
const objectUrls = new Map<string,string>();
export async function photoUrl(photo: PhotoMeta): Promise<string> {
  const local = await db.photos.get(photo.id);
  if(local && local.userId === getSession()?.user.id) {
    if(!objectUrls.has(photo.id)) objectUrls.set(photo.id,URL.createObjectURL(local.blob));
    return objectUrls.get(photo.id)!;
  }
  return photo.url ?? '';
}
let syncing: Promise<void> | null = null;
let retryAt = 0;
let failures = 0;
async function syncQueue() {
  const session = getSession(); if (!session || !navigator.onLine) return;
  const executions = (await db.executions.where('userId').equals(session.user.id).toArray()).filter(e=>e.finishedAt && e.syncStatus !== 'synced');
  for (const execution of executions) {
    if (getSession()?.user.id !== session.user.id) return;
    await db.executions.update(execution.id,{syncStatus:'syncing',syncError:undefined}); notify();
    try {
      const prepared = await api<PrepareResult>(`/sync/executions/${execution.id}`,{method:'PUT',body:JSON.stringify(execution)});
      if (!prepared.synced) {
        for(const ticket of prepared.uploads) {
          if (getSession()?.user.id !== session.user.id) throw new Error('Entre novamente para continuar o envio.');
          const photo=await db.photos.get(ticket.photoId);
          if(!photo || photo.userId !== session.user.id) throw new Error('Foto não encontrada neste aparelho.');
          const response=await fetch(ticket.url,{method:'PUT',headers:{'Content-Type':photo.blob.type,...ticket.headers},body:photo.blob,signal:AbortSignal.timeout(60000)});
          if(!response.ok) throw new Error('Não foi possível enviar a foto. Vamos tentar novamente.');
        }
        if (getSession()?.user.id !== session.user.id) throw new Error('Entre novamente para continuar o envio.');
        await api(`/sync/executions/${execution.id}/commit`,{method:'POST'});
      }
      await db.executions.update(execution.id,{syncStatus:'synced',syncError:undefined});
      failures=0; retryAt=0;
    } catch(error) {
      const message = error instanceof ApiError && error.status===401 ? 'Entre novamente para enviar seus checklists.' : error instanceof Error ? error.message : 'Não foi possível enviar. Vamos tentar novamente.';
      await db.executions.update(execution.id,{syncStatus:'error',syncError:message});
      failures++; retryAt=Date.now()+Math.min(120000,5000*2**Math.min(failures,5));
      if(error instanceof ApiError && error.status===401) break;
    } finally { notify(); }
  }
}
export function syncNow(): Promise<void> {
  if(!syncing) syncing=syncQueue().finally(()=>{syncing=null;});
  return syncing;
}
export function startSync(): () => void {
  const trigger=()=>{void syncNow();};
  const visible=()=>{if(document.visibilityState==='visible')trigger();};
  window.addEventListener('online',trigger); document.addEventListener('visibilitychange',visible);
  const timer=window.setInterval(()=>{if(Date.now()>=retryAt && document.visibilityState==='visible')trigger();},15000);
  trigger();
  return()=>{window.removeEventListener('online',trigger);document.removeEventListener('visibilitychange',visible);clearInterval(timer);};
}
export async function updateAction(action: ActionPlan,status:ActionPlan['status'],file?:File):Promise<ActionPlan> {
  if(!navigator.onLine) throw new Error('Conecte-se à internet para atualizar a ação.');
  if(status==='completed') {
    if(!file) throw new Error('Adicione uma foto da correção.');
    const blob=await prepareImage(file); const photo:PhotoMeta={id:crypto.randomUUID(),contentType:blob.type,size:blob.size};
    const ticket=await api<UploadTicket>(`/actions/${action.id}/photos`,{method:'POST',body:JSON.stringify(photo)});
    const response=await fetch(ticket.url,{method:'PUT',headers:{'Content-Type':blob.type,...ticket.headers},body:blob,signal:AbortSignal.timeout(60000)});
    if(!response.ok) throw new Error('Não foi possível enviar a foto. Tente novamente.');
    return api<ActionPlan>(`/actions/${action.id}/complete`,{method:'POST',body:JSON.stringify({version:action.version,photos:[photo]})});
  }
  return api<ActionPlan>(`/actions/${action.id}`,{method:'PATCH',body:JSON.stringify({status,version:action.version})});
}
export function saveTemplate(template: Template | Omit<Template,'id'|'version'>):Promise<Template> {
  const id='id' in template ? template.id : undefined;
  return api<Template>(`/templates${id ? `/${id}` : ''}`,{method:id?'PUT':'POST',body:JSON.stringify(template)});
}
export async function deactivateTemplate(id:string):Promise<void> {await api(`/templates/${id}`,{method:'PATCH',body:JSON.stringify({active:false})});}
