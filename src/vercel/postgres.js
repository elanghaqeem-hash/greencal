// PostgreSQL implementation of the existing D1 prepared-statement surface.
// Requires a reviewed PostgreSQL schema. It does not convert SQLite migrations.
export function toPgSql(input) {
 if (typeof input!=='string'||!input.trim()||input.length>50000)throw Error('INVALID_SQL');
 let out='',count=0,mode='normal';
 for(let i=0;i<input.length;i++){
  const c=input[i],n=input[i+1];
  if(mode==='single'){
   out+=c;
   if(c==="'"&&n==="'"){out+=n;i++;}
   else if(c==="'")mode='normal';
  }else if(mode==='double'){
   out+=c;
   if(c==='"'&&n==='"'){out+=n;i++;}
   else if(c==='"')mode='normal';
  }else if(mode==='line'){
   out+=c;
   if(c==='\n')mode='normal';
  }else if(mode==='block'){
   out+=c;
   if(c==='*'&&n==='/'){out+=n;i++;mode='normal';}
  }else if(c==="'"){out+=c;mode='single';}
  else if(c==='"'){out+=c;mode='double';}
  else if(c==='-'&&n==='-'){out+=c+n;i++;mode='line';}
  else if(c==='/'&&n==='*'){out+=c+n;i++;mode='block';}
  else if(c==='?'){out+='$'+(++count);}
  else out+=c;
 }
 if(['single','double','block'].includes(mode))throw Error('UNTERMINATED_SQL');
 out=out.replace(/\b([a-z_][a-z0-9_.]*)\s*=\s*(\$\d+)\s+COLLATE\s+NOCASE\b/gi,
  (_,col,p)=>'LOWER('+col+')=LOWER('+p+')');
 if(/\b(COLLATE\s+NOCASE|PRAGMA|INSERT\s+OR\s+|REPLACE\s+INTO|last_insert_rowid\s*\(|sqlite_master)\b/i.test(out))
  throw Error('SQLITE_ONLY_QUERY');
 return {text:out,parameterCount:count};
}
function stmt(db,sql,params=[],check=false){
 const plan=toPgSql(sql);
 if(check&&plan.parameterCount!==params.length)throw Error('SQL_PARAMETER_COUNT_MISMATCH');
 const run=()=>{if(plan.parameterCount!==params.length)throw Error('SQL_PARAMETER_COUNT_MISMATCH');return db.query(plan.text,params);};
 return {sql:plan.text,params,
  bind(...values){return stmt(db,sql,values,true);},
  async first(column){const r=await run(),row=r.rows[0]??null;return column&&row?row[column]:row;},
  async all(){const r=await run();return {success:true,results:r.rows,meta:{changes:r.rowCount??0}};},
  async run(){const r=await run();return {success:true,meta:{changes:r.rowCount??0},results:r.rows};},
 };
}
export function d1Compatibility(db){
 if(!db||typeof db.query!=='function')throw Error('MISSING_POSTGRES_CLIENT');
 return {
  prepare(sql){return stmt(db,sql);},
  async exec(sql){if(typeof sql!=='string'||sql.length>100000)throw Error('INVALID_DDL');await db.query(sql);return {count:1};},
  async batch(qs){
   if(!Array.isArray(qs)||!qs.length||qs.length>150)throw Error('INVALID_BATCH');
   if(typeof db.connect!=='function')throw Error('TRANSACTIONAL_CLIENT_REQUIRED');
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    const result=[];
    for(const q of qs){
     if(!q||typeof q.sql!=='string'||!Array.isArray(q.params))throw Error('INVALID_STATEMENT');
     const plan=toPgSql(q.sql);
     if(plan.parameterCount!==q.params.length)throw Error('SQL_PARAMETER_COUNT_MISMATCH');
     const r=await client.query(plan.text,q.params);
     result.push({success:true,results:r.rows,meta:{changes:r.rowCount??0}});
    }
    await client.query('COMMIT');
    return result;
   }catch(e){await client.query('ROLLBACK');throw e;}
   finally{client.release();}
  }
 };
}
let singleton=null;
export async function getPostgres(){
 const url=process.env.DATABASE_URL_POOLED||process.env.GREENCAL_POSTGRES_URL||process.env.DATABASE_URL;
 if(!/^postgres(?:ql)?:\/\//.test(url||''))return null;
 if(!singleton){
  const {Pool}=await import('pg');
  singleton=new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000,
    idleTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
 }
 return d1Compatibility(singleton);
}


// Distinct institutional database: public GreenCal credentials must never be
// used as a fallback for CRMS tenant data. Fail closed before opening a socket.
let enterpriseSingleton=null;
export async function getEnterprisePostgres(){
 const url=process.env.GC_ENTERPRISE_DATABASE_URL_POOLED;
 if(!/^postgres(?:ql)?:\/\//i.test(url||''))return null;
 const parsed=new URL(url);
 const publicUrls=[process.env.DATABASE_URL_POOLED,process.env.GREENCAL_POSTGRES_URL,process.env.DATABASE_URL,process.env.POSTGRES_URL]
  .filter(x=>/^postgres(?:ql)?:\/\//i.test(x||''));
 const identity=u=>{const p=new URL(u);return p.hostname.toLowerCase()+':'+(p.port||'5432')+p.pathname;};
 if(publicUrls.some(x=>identity(x)===identity(url)))throw Error('ENTERPRISE_DATABASE_NOT_ISOLATED');
 if(!enterpriseSingleton){
  const {Pool}=await import('pg');
  enterpriseSingleton=new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000,
    idleTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
 }
 return d1Compatibility(enterpriseSingleton);
}
