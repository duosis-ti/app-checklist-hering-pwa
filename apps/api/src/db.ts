import './env.js';
import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://checklist:checklist-local-only@localhost:55432/checklist', max: 10 });
export type Db = pg.PoolClient;
export async function transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
 const db = await pool.connect();
 try { await db.query('BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value; }
 catch (error) { await db.query('ROLLBACK'); throw error; }
 finally { db.release(); }
}
