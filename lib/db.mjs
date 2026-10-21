import {readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export async function database(env=process.env){
 const driver=env.DB_DRIVER||'mysql';let raw;
 if(driver==='sqlite'){
  if(env.NODE_ENV==='production')throw Error('SQLite is restricted to local QA.');
  const {DatabaseSync}=await import('node:sqlite');const file=env.SQLITE_PATH||resolve('work/store.sqlite');mkdirSync(dirname(file),{recursive:true});raw=new DatabaseSync(file);raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 }else{const mysql=await import('mysql2/promise');if(!env.MYSQL_DATABASE||!env.MYSQL_USER)throw Error('Configure MYSQL_DATABASE and MYSQL_USER');raw=mysql.createPool({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT||3306),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE,charset:'utf8mb4',connectionLimit:8,timezone:'Z',ssl:env.MYSQL_SSL==='1'?{rejectUnauthorized:true}:undefined});}
 function wrap(c){return {query:async(sql,args=[])=>{if(driver==='sqlite'){const s=c.prepare(sql);return s.columns().length?s.all(...args):s.run(...args)}const [rows]=await c.execute(sql,args);return rows},lock:driver==='mysql'?' FOR UPDATE':''}}
 const db=wrap(raw);let queue=Promise.resolve();
 db.transaction=async fn=>{if(driver==='sqlite'){const prev=queue;let release;queue=new Promise(r=>release=r);await prev;raw.exec('BEGIN IMMEDIATE');try{const r=await fn(wrap(raw));raw.exec('COMMIT');return r}catch(e){raw.exec('ROLLBACK');throw e}finally{release()}}const c=await raw.getConnection();try{await c.beginTransaction();const r=await fn(wrap(c));await c.commit();return r}catch(e){await c.rollback();throw e}finally{c.release()}};
 db.initialize=async()=>{let sql=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8');if(driver==='sqlite')raw.exec(sql.replaceAll('CREATE INDEX ','CREATE INDEX IF NOT EXISTS '));else for(let s of sql.split(';').map(x=>x.trim()).filter(Boolean)){if(s.startsWith('CREATE TABLE'))s+=' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';try{await db.query(s)}catch(e){if(e.code!=='ER_DUP_KEYNAME')throw e}}};
 db.close=async()=>driver==='sqlite'?raw.close():raw.end();return db;
}
