import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.js';
export async function migrate() {
 await transaction(async db => {
  await db.query('SELECT pg_advisory_xact_lock(71500524)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const folder = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const name of (await readdir(folder)).filter(name => name.endsWith('.sql')).sort()) {
   if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
   await db.query(await readFile(`${folder}/${name}`, 'utf8'));
   await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) migrate().then(() => pool.end()).catch(error => { console.error(error); process.exitCode = 1; void pool.end(); });
