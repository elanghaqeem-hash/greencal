#!/usr/bin/env python3
"""Ingest ORIGINAL local OJK PDFs; never treat an HTML rejection as a source.
Writes hashes + per-page text + review queue. Requirements still require SME review.
Usage: python scripts/ingest-ojk-crms.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
Expected source filenames: book-1.pdf ... book-7.pdf (no download assumptions).
"""
import hashlib, json, pathlib, sys
import fitz
TITLES=['Panduan Umum','Panduan Teknis','Metode Perhitungan Emisi','Data Makroekonomi','Data Risiko Fisik','Kertas Kerja','Pendekatan Standar']
def ingest(source_dir,output_dir):
 from urllib.parse import quote
 source=pathlib.Path(source_dir);out=pathlib.Path(output_dir);out.mkdir(parents=True,exist_ok=True);manifest=[]
 for number,title in enumerate(TITLES,1):
  p=source/f'book-{number}.pdf';official=f'Buku {number} {title} CRMS Perbankan 2026.pdf'
  item={'documentId':f'OJK-CRMS-2026-B{number}','book':number,'officialTitle':official,'publicationDate':'2026-10-06','version':'2026','sourceUrl':'https://ojk.go.id/id/Publikasi/Roadmap-dan-Pedoman/Perbankan/Documents/'+quote(official),'verificationStatus':'not_assessed'}
  if not p.exists():item['ingestionStatus']='missing';manifest.append(item);continue
  try:
   with p.open('rb') as f:
    if f.read(5)!=b'%PDF-':raise ValueError('Not a PDF; rejected response is not evidence')
   with p.open('rb') as f:
    f.seek(max(0,p.stat().st_size-4096))
    if b'%%EOF' not in f.read():raise ValueError('Incomplete PDF: terminal EOF marker missing')
   digest=hashlib.sha256()
   with p.open('rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
   with fitz.open(p) as doc:
    if doc.is_repaired:raise ValueError('Damaged/repaired PDF requires original source reconciliation')
    if doc.is_encrypted:raise ValueError('Encrypted PDF requires approved access')
    pages=[{'pdfPage':i+1,'text':page.get_text(),'reviewStatus':'not_assessed'} for i,page in enumerate(doc)]
    item.update(sha256=digest.hexdigest(),sizeBytes=p.stat().st_size,pageCount=len(pages),nonEmptyTextPages=sum(bool(x['text'].strip()) for x in pages),ingestionStatus='extracted_pending_visual_and_SME_review')
    (out/f'book-{number}-pages.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
  except Exception as e:item.update(ingestionStatus='failed',error=str(e)[:200])
  manifest.append(item)
 (out/'document-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 print(json.dumps(manifest,ensure_ascii=False,indent=2))
 return manifest
if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit(__doc__)
 ingest(*sys.argv[1:])
