import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../../../.env',import.meta.url))); }
catch(error:any) { if(error.code!=='ENOENT')throw error; }
