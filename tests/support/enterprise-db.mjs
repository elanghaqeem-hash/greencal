import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
// Real SQLite + the exact SQL migration/triggers; only D1 transport is adapted.
export function enterpriseDb(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0001_foundation.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0002_domain_registers.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0003_quant_engines.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0004_advanced_analytics.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0005_portfolio_source_controls.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../../migrations/enterprise/0006_release_authorization.sql',import.meta.url),'utf8'));
 const db={sqlite,async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}},prepare(sql){return {bind(...args){const statement=sqlite.prepare(sql);return {
  async first(){return statement.get(...args)||null;},
  async all(){return {results:statement.all(...args)};},
  async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}
 };}};}};
 return db;
}
