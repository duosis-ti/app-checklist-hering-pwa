import './env.js';
import { app } from './app.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { ensureBucket } from './storage.js';
import { jwtSecret } from './auth.js';
async function start() {
 jwtSecret();
 await migrate();
 if(process.env.SEED_DEMO==='true')await seed();
 for(let attempt=0;attempt<20;attempt++){
  try{await ensureBucket();break;}
  catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
 }
 const server=app.listen(Number(process.env.PORT??3001),'0.0.0.0',(error?:Error)=>{
  if(error){console.error('Não foi possível abrir a porta da API:',error.message);void pool.end().then(()=>process.exit(1));return;}
  console.log(`Checklist API: porta ${process.env.PORT??3001}`);
 });
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>{void pool.end().then(()=>process.exit(0));}));
}
start().catch(error=>{console.error('Falha ao iniciar API:',error.message);void pool.end();process.exitCode=1;});
