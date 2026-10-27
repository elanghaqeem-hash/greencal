// Generate reviewed SQL ONLY; never connects to or modifies any database.
// Feed an approved provisioning JSON document on stdin; keep output private.
// {institution:{id,name,institutionType,currency},operator,approvalReference,
//  memberships:[{subject,email,role}]}
import {ROLES} from '../src/enterprise/policy.js';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>32768)throw Error('Provisioning payload too large');}
const body=JSON.parse(input),i=body.institution;
const ident=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
if(!i||!ident(i.id)||typeof i.name!=='string'||!i.name.trim()||i.name.length>200||!['BUS','UUS','BUK','LJK'].includes(i.institutionType)||!/^[A-Z]{3}$/.test(i.currency))throw Error('Invalid institution');
if(typeof body.operator!=='string'||!body.operator.trim()||typeof body.approvalReference!=='string'||!body.approvalReference.trim())throw Error('Operator and approval reference required');
if(!Array.isArray(body.memberships)||!body.memberships.length||body.memberships.length>100)throw Error('1–100 verified memberships required');
const subjects=new Set();for(const m of body.memberships){if(typeof m.subject!=='string'||!m.subject||m.subject.length>255||subjects.has(m.subject)||typeof m.email!=='string'||!/^\S+@\S+\.\S+$/.test(m.email)||!ROLES.includes(m.role))throw Error('Invalid/duplicate membership');subjects.add(m.subject);}
const q=s=>"'"+String(s).replaceAll("'","''")+"'",stamp=new Date().toISOString();
const lines=['-- Apply ONLY to the reviewed dedicated ENTERPRISE_DB. No credentials generated.'];
lines.push(`INSERT INTO gcx_institutions(id,name,institution_type,currency,created_at) VALUES(${[i.id,i.name,i.institutionType,i.currency,stamp].map(q).join(',')});`);
for(const m of body.memberships)lines.push(`INSERT INTO gcx_memberships(tenant_id,subject,email,role) VALUES(${[i.id,m.subject,m.email.toLowerCase(),m.role].map(q).join(',')});`);
lines.push(`INSERT INTO gcx_events(tenant_id,actor,action,target,occurred_at) VALUES(${[i.id,body.operator,'institution.provisioned',body.approvalReference,stamp].map(q).join(',')});`);
process.stdout.write(lines.join('\n')+'\n');
