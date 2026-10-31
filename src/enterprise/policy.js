// Membership and role come exclusively from ENTERPRISE_DB after JWT verification.
export const ROLES = Object.freeze(['super_administrator','institution_administrator','crms_project_administrator','data_maker','risk_analyst','climate_model_analyst','checker','approver','risk_management_head','compliance_reviewer','sharia_governance_reviewer','executive_viewer','internal_auditor','external_auditor']);
export const DOMAIN_KINDS=Object.freeze(['governance','portfolio','scenario','physical','transition','report_package']);
export const KINDS = Object.freeze(['risk','factor','emission','regulatory_document','requirement',...DOMAIN_KINDS]);
const creators = Object.freeze({
 risk:['risk_analyst','crms_project_administrator'],
 factor:['institution_administrator','climate_model_analyst'],
 emission:['data_maker'],
 regulatory_document:['compliance_reviewer','crms_project_administrator'],
 requirement:['compliance_reviewer','crms_project_administrator'],
 governance:['crms_project_administrator','risk_analyst'],
 portfolio:['data_maker'],
 scenario:['climate_model_analyst'],
 physical:['risk_analyst','climate_model_analyst'],
 transition:['risk_analyst','climate_model_analyst'],
 report_package:['compliance_reviewer','crms_project_administrator']
});
export const canCreate = (role,kind) => (creators[kind]||[]).includes(role);
export const canCheck = role => ['checker','climate_model_analyst','compliance_reviewer','sharia_governance_reviewer'].includes(role);
export const canApprove = role => ['approver','risk_management_head'].includes(role);
export function permissions(role){return {create:KINDS.filter(k=>canCreate(role,k)),check:canCheck(role),approve:canApprove(role),audit:['internal_auditor','institution_administrator','compliance_reviewer','risk_management_head'].includes(role)};}
export class ApiError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
export function transition(row,action,actor,reason=''){
 const owner=row.created_by===actor.subject;
 if(action==='submit' && ['draft','rejected'].includes(row.status) && owner && canCreate(actor.role,row.kind))return {status:'submitted',checked_by:null,approved_by:null};
 if(action==='check' && row.status==='submitted' && !owner && canCheck(actor.role))return {status:'checked',checked_by:actor.subject,approved_by:null};
 if(action==='approve' && row.status==='checked' && !owner && row.checked_by!==actor.subject && canApprove(actor.role))return {status:'approved',checked_by:row.checked_by,approved_by:actor.subject};
 if(action==='reject' && ['submitted','checked'].includes(row.status) && !owner && (canCheck(actor.role)||canApprove(actor.role)) && reason.trim())return {status:'rejected',checked_by:null,approved_by:null};
 if(action==='archive' && ['draft','rejected'].includes(row.status) && owner && reason.trim())return {status:'archived',checked_by:null,approved_by:null};
 throw new ApiError(403,'WORKFLOW_DENIED','Status, peran, alasan, atau pemisahan tugas tidak memenuhi syarat.');
}
