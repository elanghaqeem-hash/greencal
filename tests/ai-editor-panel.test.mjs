import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=html.slice(html.indexOf("<style"),html.indexOf("</style>")+8);
const body=html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>"));
const start=body.indexOf("// Editorial Word-like WYSIWYG panel");
const stop=body.indexOf("box.innerHTML = html;",start);
assert.ok(start>0&&stop>start,"cannot locate dynamically rendered editor");

const panel=body.slice(start,stop);
const ids=["gcAiEditorTitle","gcAiEdit","gcAiSave","gcAiCancel","gcAiRestore",
 "gcAiEditorStatus","gcAiDraftBadge","gcAiToolbar","gcAiNarrativeView","gcAiNarrativeEditor"];

test("editor panel preserves original labels, semantics and a single instance of each control",()=>{
 for(const id of ids)assert.equal(html.split('id="'+id+'"').length-1,1,"missing or duplicate "+id);
 assert.match(panel,/Draf Narasi Pengungkapan Laporan Keberlanjutan \(TCFD \/ ISSB S2\)/);
 assert.match(panel,/Perubahan hanya disimpan sebagai draft/);
 assert.match(panel,/aria-labelledby="gcAiEditorTitle"/);
 assert.match(panel,/role="group" aria-label="Tindakan editor narasi"/);
 assert.match(panel,/aria-live="polite"/);
 assert.match(panel,/class="gc-ai-editor-leading-icon"/);
 assert.match(panel,/class="gc-ai-editor-statusline"/);
});

test("real edit/save/cancel/restore buttons remain connected to existing behavior",()=>{
 for(const [id,event] of [
  ["gcAiEdit","gcAiOpenEditor"],
  ["gcAiSave","gcAiSaveEditor"],
  ["gcAiCancel","gcAiCancelEditor"],
  ["gcAiRestore","gcAiRestoreAutomatic"]]){
  assert.match(body,new RegExp('\\$\\("#'+id+'"\\)\\?\\.addEventListener\\("click"'));
  assert.match(body,new RegExp(event));
 }
 assert.match(body,/gcAiSetEditMode\(true\)/);
 assert.match(body,/toggle\.hidden=enabled/);
 assert.match(body,/save\.hidden=!enabled/);
 assert.match(body,/cancel\.hidden=!enabled/);
 assert.match(body,/restore\.hidden=enabled\|\|!gcAiDraft\(\)/);
 assert.match(body,/gcAiCleanHtml\(editor\.innerHTML\)/);
 assert.match(body,/status:"draft-manual"/);
 assert.match(body,/confirmDlg\("Kembalikan narasi otomatis\?"/);
});

test("responsive action spacing does not hide buttons behind headings",()=>{
 assert.match(css,/container:gc-narrative \/ inline-size/);
 assert.match(css,/@container gc-narrative \(max-width:1100px\)/);
 assert.match(css,/@container gc-narrative \(max-width:600px\)/);
 assert.match(css,/@container gc-narrative \(max-width:390px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/\.gc-ai-editor-panel \[hidden\]\{display:none!important\}/);
 assert.match(css,/overflow-wrap:anywhere/);
 for(const className of ["gc-ai-action-edit","gc-ai-action-save","gc-ai-action-cancel","gc-ai-action-restore"]){
  assert.match(css,new RegExp("\\."+className+"\\{"));
  assert.match(panel,new RegExp(className));
 }
});

test("narrative formatting remains editable and saves only draft",()=>{
 assert.match(panel,/contenteditable="true"/);
 assert.match(panel,/role="textbox"/);
 assert.match(panel,/aria-multiline="true"/);
 assert.match(panel,/id="gcAiToolbar"/);
 assert.match(body,/gcAiSetChanged/);
 assert.match(body,/gcAiSaveEditor/);
 assert.match(body,/gcAiCancelEditor/);
 assert.match(body,/gcAiRestoreAutomatic/);
});

test("inline code compiles, without changes to the core data calculation engine",()=>{
 assert.ok(body.length>150000);
 assert.doesNotThrow(()=>new Function(body));
 assert.match(body,/function runCalc\(/);
 assert.match(body,/function renderWzDinas\(/);
});
