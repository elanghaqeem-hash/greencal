// Uji integrasi skema on-premise PostgreSQL 16.
// Hanya berjalan terhadap basis data CI sekali pakai bernama crms_onprem_ci.
// Jangan pernah mengarahkan ke basis data bank; nama basis data diperiksa dulu.
//
// Yang dibuktikan di sini bukan "skema ada", melainkan jaminannya benar-benar
// ditegakkan: isolasi tenant lewat RLS, fail closed tanpa konteks tenant,
// audit append-only berantai hash, larangan double counting, SoD parameter,
// dan tidak adanya kolom pecahan biner.
//
// Catatan arsitektur yang dibuktikan uji ini: peran pemilik objek (crms_owner)
// HANYA berwenang pada tiga tabel provisioning platform. Seluruh data bisnis
// hanya dapat disentuh crms_app dengan konteks tenant aktif. Itulah sebabnya
// uji di bawah menulis data lewat klien aplikasi, bukan lewat pemilik.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const url = process.env.GREENCAL_ONPREM_PG_URL;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const GENESIS = '0'.repeat(64);

const skipIfNoDb = (t) => {
  if (!url) { t.skip('Butuh GREENCAL_ONPREM_PG_URL ke basis data sekali pakai crms_onprem_ci'); return true; }
  return false;
};

async function connect(role, applicationName) {
  const { Client } = await import('pg');
  const c = new Client({ connectionString: url, application_name: applicationName });
  await c.connect();
  const dbName = (await c.query('SELECT current_database() AS n')).rows[0].n;
  if (dbName !== 'crms_onprem_ci') {
    await c.end();
    throw new Error(`TEST_DATABASE_NAME_MUST_BE_CRMS_ONPREM_CI, diterima ${dbName}`);
  }
  await c.query(`SET ROLE ${role}`);
  return c;
}

/** Klien pemilik: provisioning institusi dan kueri katalog saja. */
async function withOwner(fn) {
  const c = await connect('crms_owner', 'crms-owner-test');
  try { return await fn(c); } finally { await c.end().catch(() => {}); }
}

/** Klien aplikasi dengan konteks tenant aktif, persis seperti runtime. */
async function withApp(tenantCode, subject, fn) {
  const owner = await connect('crms_owner', 'crms-lookup');
  let tenantId;
  try {
    const r = await owner.query('SELECT id FROM crms.institutions WHERE code = $1', [tenantCode]);
    assert.equal(r.rows.length, 1, `institusi ${tenantCode} belum terdaftar; uji setup wajib jalan lebih dulu`);
    tenantId = r.rows[0].id;
  } finally { await owner.end().catch(() => {}); }

  const c = await connect('crms_app', 'crms-app-test');
  try {
    await c.query('SELECT set_config($1,$2,false)', ['crms.tenant_id', tenantId]);
    await c.query('SELECT set_config($1,$2,false)', ['crms.subject', subject]);
    return await fn(c, tenantId);
  } finally { await c.end().catch(() => {}); }
}

test('setup: dua institusi sintetis terdaftar oleh peran platform', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    // Tidak memakai TRUNCATE: tabel ini bertaut ke log audit yang menolak
    // TRUNCATE, dan basis data CI memang dibuat ulang setiap kali.
    for (const [code, name, type] of [['CI-A', 'SINTETIS A', 'BUS'], ['CI-B', 'SINTETIS B', 'BUK']]) {
      await owner.query(
        `INSERT INTO crms.institutions(code,name,institution_type,currency,created_by)
         VALUES($1,$2,$3,'IDR','ci-platform') ON CONFLICT (code) DO NOTHING`, [code, name, type]);
    }
    const sharia = await owner.query(
      "SELECT code,is_sharia_entity FROM crms.institutions WHERE code LIKE 'CI-%' ORDER BY code");
    // Entitas syariah dihitung skema, bukan diisi manual.
    assert.deepEqual(sharia.rows, [
      { code: 'CI-A', is_sharia_entity: true },
      { code: 'CI-B', is_sharia_entity: false },
    ]);
  });
});

test('tanpa konteks tenant, kueri gagal keras alih-alih membaca semua tenant', async (t) => {
  if (skipIfNoDb(t)) return;
  const c = await connect('crms_app', 'crms-no-context');
  try {
    await assert.rejects(
      () => c.query('SELECT count(*) FROM crms.regulatory_documents'),
      (e) => /TENANT_CONTEXT_MISSING/.test(e.message),
      'kueri tanpa crms.tenant_id wajib gagal, bukan mengembalikan 0 baris secara diam-diam',
    );
  } finally { await c.end().catch(() => {}); }
});

test('pemilik objek tidak dapat menyentuh data bisnis tanpa jalur aplikasi', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const tenant = (await owner.query("SELECT id FROM crms.institutions WHERE code='CI-A'")).rows[0].id;
    // FORCE ROW LEVEL SECURITY berlaku juga bagi pemilik tabel, dan pemilik
    // tidak punya policy pada tabel data, sehingga insert ditolak.
    await assert.rejects(
      () => owner.query(
        `INSERT INTO crms.regulatory_documents(tenant_id,id,title,version,effective_from,registered_by)
         VALUES($1,'selundupan','Dokumen Selundupan','2026','2026-01-01','owner')`, [tenant]),
      (e) => /row-level security/i.test(e.message),
      'pemilik tabel pun tidak boleh menulis data bisnis di luar jalur aplikasi bertenant');
  });
});

test('dokumen dan parameter awal dimuat lewat jalur aplikasi bertenant', async (t) => {
  if (skipIfNoDb(t)) return;
  for (const code of ['CI-A', 'CI-B']) {
    await withApp(code, 'loader-1', async (app, tenantId) => {
      await app.query(
        `INSERT INTO crms.regulatory_documents
           (tenant_id,id,title,book_no,version,effective_from,source_sha256,page_count,registered_by)
         VALUES($1,'buku-2','Panduan Teknis CRMS Perbankan 2026',2,'2026','2026-01-01',$2,120,'loader-1')
         ON CONFLICT DO NOTHING`, [tenantId, sha(`sumber-${code}`)]);
      const n = (await app.query('SELECT count(*)::int AS n FROM crms.regulatory_documents')).rows[0].n;
      assert.equal(n, 1, `tenant ${code} wajib melihat tepat satu dokumen, miliknya sendiri`);
    });
  }
});

test('RLS mengisolasi tenant: tenant A tidak dapat melihat atau menulis data tenant B', async (t) => {
  if (skipIfNoDb(t)) return;
  const bId = await withOwner(async (owner) =>
    (await owner.query("SELECT id FROM crms.institutions WHERE code='CI-B'")).rows[0].id);

  await withApp('CI-A', 'u-a', async (app, aId) => {
    const own = (await app.query('SELECT tenant_id FROM crms.regulatory_documents')).rows;
    assert.equal(own.length, 1);
    assert.equal(own[0].tenant_id, aId);

    // Menyebut tenant_id tenant lain secara eksplisit pun tidak menembus RLS.
    const cross = (await app.query(
      'SELECT * FROM crms.regulatory_documents WHERE tenant_id = $1', [bId])).rows;
    assert.equal(cross.length, 0, 'filter eksplisit ke tenant lain tetap kosong');

    // Menulis baris bertenant lain ditolak WITH CHECK.
    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.data_snapshots(tenant_id,id,source_system,as_of_date,row_count,snapshot_hash,ingested_by)
         VALUES($1,'snap-selundup','core','2026-12-31',1,$2,'u-a')`, [bId, sha('x')]),
      (e) => /row-level security/i.test(e.message),
      'insert lintas tenant wajib ditolak policy');

    // UPDATE lintas tenant tidak mengenai baris apa pun, bukan mengubah diam-diam.
    const upd = await app.query(
      `UPDATE crms.regulatory_documents SET title='Diubah' WHERE tenant_id = $1`, [bId]);
    assert.equal(upd.rowCount, 0, 'UPDATE lintas tenant wajib nol baris');
  });

  // Data tenant B tetap utuh.
  await withApp('CI-B', 'u-b', async (app) => {
    const r = (await app.query('SELECT title FROM crms.regulatory_documents')).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].title, 'Panduan Teknis CRMS Perbankan 2026');
  });
});

test('tabel ber-tenant tanpa RLS atau tanpa FORCE adalah kegagalan rilis', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const rows = (await owner.query('SELECT * FROM crms.find_tables_without_rls()')).rows;
    assert.deepEqual(rows, [], `tabel berikut belum terlindungi: ${JSON.stringify(rows)}`);
  });
});

test('tidak ada kolom double precision atau real di seluruh skema', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const rows = (await owner.query('SELECT * FROM crms.find_float_columns()')).rows;
    assert.deepEqual(rows, [], `kolom pecahan biner ditemukan: ${JSON.stringify(rows)}`);
  });
});

test('NUMERIC(38,12) menyimpan nilai eksak; pembagian SQL wajib di-cast balik', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const r = (await owner.query(
      `SELECT (0.1::crms.amount + 0.2::crms.amount = 0.3::crms.amount) AS exact_add,
              (0.1::float8 + 0.2::float8 = 0.3::float8) AS float_add,
              (1::crms.amount / 3)::text AS raw_div,
              ((1::crms.amount / 3)::crms.amount)::text AS cast_div`)).rows[0];
    assert.equal(r.exact_add, true, 'penjumlahan NUMERIC wajib eksak');
    assert.equal(r.float_add, false, 'float8 memang tidak eksak; inilah alasan domain NUMERIC');

    // Temuan penting: pembagian pada PostgreSQL TIDAK mempertahankan skala
    // domain, hasilnya melebar menjadi 20 desimal. Karena itu seluruh
    // aritmetika dijalankan di src/onprem/precision/decimal.js dan basis data
    // hanya menyimpan; bila pembagian dilakukan di SQL, hasilnya wajib
    // di-cast balik ke crms.amount agar skala 12 tetap terjaga.
    assert.notEqual(r.raw_div, '0.333333333333', 'pembagian mentah SQL melebar melampaui skala 12');
    assert.equal(r.cast_div, '0.333333333333');
  });
});

test('nilai melebihi skala 12 dibulatkan oleh domain, bukan ditolak diam-diam', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const r = (await owner.query(
      `SELECT '0.0000000000005'::crms.amount::text AS half_up,
              '0.0000000000004'::crms.amount::text AS half_down`)).rows[0];
    // PostgreSQL membulatkan half-away-from-zero pada cast NUMERIC, sama dengan
    // kontrak divRoundHalfUp pada decimal.js. Lapisan aplikasi tetap MENOLAK
    // masukan berskala >12 (galat SCALE_EXCEEDED) agar pembulatan tidak pernah
    // terjadi tanpa sepengetahuan penggunanya.
    assert.equal(r.half_up, '0.000000000001');
    assert.equal(r.half_down, '0.000000000000');
  });
});

test('parameter tidak dapat APPROVED tanpa dua ekstraksi yang cocok dan tiga orang berbeda', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'extractor-1', async (app, tenant) => {
    const ins = (over = {}) => {
      const p = {
        key: 'book2.table_3.pd_bucket_1.upper', doc: 'buku-2', page: 'hal. 41', version: 1,
        value: '0.004800000000', status: 'SOURCE_PENDING', createdBy: 'extractor-1', ...over,
      };
      return app.query(
        `INSERT INTO crms.regulatory_parameters
           (tenant_id,parameter_key,version,value_numeric,unit,status,document_id,page_ref,
            extraction_a_digest,extraction_b_digest,verified_by,verified_at,approved_by,approved_at,created_by)
         VALUES($1,$2,$3,$4,'persen',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [tenant, p.key, p.version, p.value, p.status, p.doc, p.page,
          p.a ?? null, p.b ?? null, p.verifiedBy ?? null, p.verifiedAt ?? null,
          p.approvedBy ?? null, p.approvedAt ?? null, p.createdBy]);
    };
    const now = new Date().toISOString();

    // Hanya satu constraint yang dilanggar di sini, agar galat yang muncul
    // memang berasal dari aturan ekstraksi ganda dan bukan dari aturan lain.
    await assert.rejects(() => ins({
      version: 10, status: 'APPROVED',
      verifiedBy: 'verifier-1', verifiedAt: now, approvedBy: 'approver-1', approvedAt: now,
    }), (e) => /dual_requires_two_extractions/.test(e.message),
      'APPROVED tanpa dua ekstraksi wajib ditolak');

    await assert.rejects(() => ins({
      version: 11, status: 'APPROVED', a: sha('ekstraksi-1'), b: sha('ekstraksi-2'),
      verifiedBy: 'verifier-1', verifiedAt: now, approvedBy: 'approver-1', approvedAt: now,
    }), (e) => /dual_requires_two_extractions/.test(e.message),
      'dua ekstraksi yang BERBEDA wajib ditolak, bukan dianggap cukup');

    await assert.rejects(() => ins({
      version: 12, status: 'APPROVED', a: sha('e'), b: sha('e'),
      verifiedBy: 'extractor-1', verifiedAt: now, approvedBy: 'approver-1', approvedAt: now,
    }), (e) => /parameter_sod_three_persons/.test(e.message),
      'pengekstrak tidak boleh memverifikasi hasil kerjanya sendiri');

    await assert.rejects(() => ins({
      version: 13, status: 'APPROVED', a: sha('e'), b: sha('e'),
      verifiedBy: 'verifier-1', verifiedAt: now, approvedBy: 'verifier-1', approvedAt: now,
    }), (e) => /parameter_sod_three_persons/.test(e.message),
      'pemverifikasi tidak boleh menyetujui hasil verifikasinya sendiri');

    await assert.rejects(() => ins({
      version: 15, status: 'SOURCE_VERIFIED', a: sha('e'), b: sha('e'),
    }), (e) => /verified_requires_verifier/.test(e.message),
      'status terverifikasi tanpa identitas pemverifikasi wajib ditolak');

    // Jalur sah: tiga orang berbeda, dua ekstraksi cocok, dokumen berchecksum.
    await ins({
      version: 14, status: 'APPROVED', a: sha('e'), b: sha('e'),
      verifiedBy: 'verifier-1', verifiedAt: now, approvedBy: 'approver-1', approvedAt: now,
    });
    const ok = await app.query(
      'SELECT status FROM crms.regulatory_parameters WHERE version=14');
    assert.equal(ok.rows[0].status, 'APPROVED');
  });
});

test('parameter APPROVED tidak dapat diubah nilainya maupun diturunkan statusnya', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'extractor-1', async (app) => {
    await assert.rejects(
      () => app.query(
        `UPDATE crms.regulatory_parameters SET value_numeric='9.000000000000' WHERE version=14`),
      (e) => /PARAMETER_FROZEN/.test(e.message));
    await assert.rejects(
      () => app.query(
        `UPDATE crms.regulatory_parameters SET status='SOURCE_PENDING' WHERE version=14`),
      (e) => /PARAMETER_STATUS_REGRESSION/.test(e.message));
    // Mensupersede diperbolehkan; itulah satu-satunya jalan perubahan.
    const r = await app.query(
      `UPDATE crms.regulatory_parameters SET status='SUPERSEDED' WHERE version=14`);
    assert.equal(r.rowCount, 1);
  });
});

test('parameter tidak dapat naik status bila dokumen sumbernya belum berchecksum', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'extractor-1', async (app, tenant) => {
    await app.query(
      `INSERT INTO crms.regulatory_documents
         (tenant_id,id,title,book_no,annex_ref,version,effective_from,registered_by)
       VALUES($1,'buku-7-annex-a','Lampiran Buku 7 Annex A Risiko Kredit',7,'Annex A','2026','2026-01-01','loader-1')
       ON CONFLICT DO NOTHING`, [tenant]);
    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.regulatory_parameters
           (tenant_id,parameter_key,version,value_numeric,status,document_id,page_ref,
            extraction_a_digest,extraction_b_digest,verified_by,verified_at,created_by)
         VALUES($1,'book7.table_a5.cell_1_1',1,'0.350000000000','VERIFIED_DUAL','buku-7-annex-a','hal. 12',
                $2,$2,'verifier-1',now(),'extractor-1')`, [tenant, sha('e')]),
      (e) => /SOURCE_CHECKSUM_MISSING/.test(e.message),
      'status VERIFIED_DUAL tanpa checksum sumber wajib ditolak');

    // Status rendah tetap boleh, sehingga tabel yang sumbernya belum lengkap
    // dapat didaftarkan sebagai SOURCE_PENDING tanpa pernah mengisi laporan.
    await app.query(
      `INSERT INTO crms.regulatory_parameters
         (tenant_id,parameter_key,version,value_numeric,status,document_id,page_ref,created_by)
       VALUES($1,'book7.table_a5.cell_1_1',1,'0.350000000000','SOURCE_PENDING','buku-7-annex-a','hal. 12','extractor-1')`,
      [tenant]);
  });
});

test('hanya satu versi APPROVED per parameter yang boleh hidup', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'extractor-1', async (app, tenant) => {
    const ins = (version) => app.query(
      `INSERT INTO crms.regulatory_parameters
         (tenant_id,parameter_key,version,value_numeric,status,document_id,page_ref,
          extraction_a_digest,extraction_b_digest,verified_by,verified_at,approved_by,approved_at,created_by)
       VALUES($1,'book2.unik',$2,'1.000000000000','APPROVED','buku-2','hal. 1',
              $3,$3,'verifier-1',now(),'approver-1',now(),'extractor-1')`, [tenant, version, sha('e')]);
    await ins(1);
    await assert.rejects(() => ins(2),
      (e) => /one_approved_version_per_parameter/.test(e.message));
  });
});

test('calculation_run bersifat immutable kecuali bukti reproduksi independen', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'analyst-1', async (app, tenant) => {
    await app.query(
      `INSERT INTO crms.data_snapshots(tenant_id,id,source_system,as_of_date,row_count,snapshot_hash,ingested_by)
       VALUES($1,'snap-1','core_banking','2026-12-31',1000,$2,'u-a') ON CONFLICT DO NOTHING`,
      [tenant, sha('snap')]);
    const h = sha('x');
    await app.query(
      `INSERT INTO crms.calculation_runs
         (tenant_id,run_id,mode,scenario,projection_year,snapshot_id,snapshot_hash,
          parameter_set_digest,formula_set_digest,input_digest,output_digest,manifest_digest,
          engine_contract,executed_by,executed_at)
       VALUES($1,'RUN-1','standardised','net_zero_2050',2030,'snap-1',$2,$2,$2,$2,$2,$2,
              'greencal-onprem-run/1','analyst-1',now()) ON CONFLICT DO NOTHING`, [tenant, h]);

    await assert.rejects(
      () => app.query(`UPDATE crms.calculation_runs SET output_digest=$1 WHERE run_id='RUN-1'`, [sha('diubah')]),
      (e) => /RUN_IMMUTABLE/.test(e.message));

    await assert.rejects(
      () => app.query(
        `UPDATE crms.calculation_runs SET reproduced_by='analyst-1',reproduced_at=now(),reproduction_matched=true
          WHERE run_id='RUN-1'`),
      (e) => /reproduction_independent/.test(e.message),
      'pelaksana run tidak boleh menjadi validator independennya sendiri');

    await assert.rejects(
      () => app.query(
        `UPDATE crms.calculation_runs SET reproduced_by='validator-1' WHERE run_id='RUN-1'`),
      (e) => /reproduction_evidence_complete/.test(e.message),
      'bukti reproduksi wajib lengkap: siapa, kapan, dan hasilnya');

    await app.query(
      `UPDATE crms.calculation_runs SET reproduced_by='validator-1',reproduced_at=now(),reproduction_matched=true
        WHERE run_id='RUN-1'`);
    const r = await app.query(`SELECT reproduction_matched FROM crms.calculation_runs WHERE run_id='RUN-1'`);
    assert.equal(r.rows[0].reproduction_matched, true);
  });
});

test('engine_contract dan mode di luar kontrak ditolak', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'analyst-1', async (app, tenant) => {
    const h = sha('y');
    const ins = (engine, mode) => app.query(
      `INSERT INTO crms.calculation_runs
         (tenant_id,run_id,mode,snapshot_id,snapshot_hash,parameter_set_digest,formula_set_digest,
          input_digest,output_digest,manifest_digest,engine_contract,executed_by,executed_at)
       VALUES($1,$2,$3,'snap-1',$4,$4,$4,$4,$4,$4,$5,'analyst-1',now())`,
      [tenant, `RUN-${engine}-${mode}`, mode, h, engine]);
    await assert.rejects(() => ins('engine-lain', 'standardised'), (e) => /engine_contract/.test(e.message));
    await assert.rejects(() => ins('greencal-onprem-run/1', 'mode-karangan'), (e) => /run_mode/.test(e.message));
  });
});

test('snapshot_hash yang bukan SHA-256 heksadesimal ditolak domain', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'analyst-1', async (app, tenant) => {
    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.data_snapshots(tenant_id,id,source_system,as_of_date,row_count,snapshot_hash,ingested_by)
         VALUES($1,'snap-bad','core','2026-12-31',1,'bukan-hash','u-a')`, [tenant]),
      (e) => /sha256_hex/.test(e.message));
  });
});

test('komponen tidak dapat dihitung pada pasangan kanal terlarang', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'analyst-1', async (app, tenant) => {
    const add = (component, channel) => app.query(
      `INSERT INTO crms.aggregation_components(tenant_id,aggregation_id,component_id,channel,source_run_id,value)
       VALUES($1,'AGG-1',$2,$3,'RUN-1','1.000000000000')`, [tenant, component, channel]);

    await add('collateral_physical_haircut', 'lgd');
    await assert.rejects(() => add('collateral_physical_haircut', 'bank_physical_loss'),
      (e) => /DOUBLE_COUNTING/.test(e.message),
      'haircut agunan tidak boleh masuk LGD dan kerugian fisik bank sekaligus');

    await add('bank_own_asset_damage', 'operational');
    await assert.rejects(() => add('bank_own_asset_damage', 'credit'),
      (e) => /DOUBLE_COUNTING/.test(e.message));

    await add('amortised_cost_impairment', 'ecl');
    await assert.rejects(() => add('amortised_cost_impairment', 'mtm'),
      (e) => /DOUBLE_COUNTING/.test(e.message));

    // Komponen lain pada kanal yang sama tetap sah; aturan berlaku per komponen.
    await add('transition_cost', 'ecl');
    await add('transition_cost', 'mtm');

    // Agregasi berbeda tidak saling mengunci.
    await app.query(
      `INSERT INTO crms.aggregation_components(tenant_id,aggregation_id,component_id,channel,source_run_id,value)
       VALUES($1,'AGG-2','collateral_physical_haircut','bank_physical_loss','RUN-1','1.000000000000')`, [tenant]);
  });
});

test('log audit menegakkan rantai hash: sequence menerus dan prev_hash menautkan', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-B', 'u1', async (app, tenant) => {
    const append = (sequence, prevHash, hash, extra = {}) => app.query(
      `INSERT INTO crms_audit.event_log
         (tenant_id,sequence,occurred_at,event_type,actor_subject,actor_role,resource_kind,resource_id,
          action,outcome,deny_reason,payload_digest,prev_hash,hash)
       VALUES($1,$2,$3,'RECORD_SUBMITTED','u1','data_maker','emission_activity','rec-1',
              'submit',$4,$5,$6,$7,$8)`,
      [tenant, sequence, extra.at ?? new Date(Date.now() + sequence * 1000).toISOString(),
        extra.outcome ?? 'allowed', extra.denyReason ?? null, sha(`payload-${sequence}`), prevHash, hash]);

    const h1 = sha('e1');
    const h2 = sha('e2');

    await assert.rejects(() => append(2, GENESIS, h1), (e) => /AUDIT_SEQUENCE_START/.test(e.message));
    await assert.rejects(() => append(1, sha('bukan-genesis'), h1), (e) => /AUDIT_GENESIS_EXPECTED/.test(e.message));

    await append(1, GENESIS, h1);
    await assert.rejects(() => append(3, h1, h2), (e) => /AUDIT_SEQUENCE_GAP/.test(e.message));
    await assert.rejects(() => append(2, sha('hash-palsu'), h2), (e) => /AUDIT_CHAIN_BROKEN/.test(e.message));
    await append(2, h1, h2);

    const chain = (await app.query(
      'SELECT sequence,prev_hash,hash FROM crms_audit.event_log ORDER BY sequence')).rows;
    assert.equal(chain.length, 2);
    assert.equal(chain[0].prev_hash, GENESIS);
    assert.equal(chain[1].prev_hash, chain[0].hash);

    const findings = (await app.query('SELECT * FROM crms_audit.verify_chain($1)', [tenant])).rows;
    assert.deepEqual(findings, [], 'rantai yang sah tidak boleh menghasilkan temuan');
  });
});

test('penolakan akses wajib menyertakan alasan', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-B', 'u1', async (app, tenant) => {
    const last = (await app.query(
      'SELECT sequence,hash FROM crms_audit.event_log ORDER BY sequence DESC LIMIT 1')).rows[0];
    await assert.rejects(
      () => app.query(
        `INSERT INTO crms_audit.event_log
           (tenant_id,sequence,occurred_at,event_type,actor_subject,resource_kind,action,outcome,prev_hash,hash)
         VALUES($1,$2,now(),'ACCESS_DENIED','u9','portfolio','read','denied',$3,$4)`,
        [tenant, Number(last.sequence) + 1, last.hash, sha('e-deny')]),
      (e) => /deny_requires_reason/.test(e.message));
  });
});

test('log audit append-only: UPDATE, DELETE, dan TRUNCATE semuanya ditolak', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-B', 'u1', async (app) => {
    // Hak UPDATE dan DELETE tidak diberikan kepada crms_app, sehingga galatnya
    // sudah muncul di lapis hak akses sebelum trigger diuji.
    await assert.rejects(
      () => app.query(`UPDATE crms_audit.event_log SET outcome='denied'`),
      (e) => /permission denied|AUDIT_APPEND_ONLY/.test(e.message));
    await assert.rejects(
      () => app.query('DELETE FROM crms_audit.event_log'),
      (e) => /permission denied|AUDIT_APPEND_ONLY/.test(e.message));
    await assert.rejects(
      () => app.query('TRUNCATE crms_audit.event_log'),
      (e) => /permission denied|AUDIT_APPEND_ONLY/.test(e.message));
  });

  // Lapis kedua: pemilik objek tidak memiliki policy pada log audit, sehingga
  // UPDATE dan DELETE miliknya tidak mengenai satu baris pun.
  await withOwner(async (owner) => {
    const upd = await owner.query("UPDATE crms_audit.event_log SET outcome='denied'");
    assert.equal(upd.rowCount, 0, 'pemilik objek tidak boleh melihat, apalagi mengubah, baris audit');
  });

  // Lapis ketiga, yang paling penting: koneksi dengan hak penuh ke basis data
  // pun tidak dapat mengubah log audit, karena trigger menolak tanpa kecuali.
  const su = await (async () => {
    const { Client } = await import('pg');
    const c = new Client({ connectionString: url, application_name: 'crms-dba-test' });
    await c.connect();
    return c;
  })();
  try {
    const isSuper = (await su.query('SELECT usesuper FROM pg_user WHERE usename = current_user')).rows[0];
    assert.equal(isSuper?.usesuper, true, 'uji lapis ketiga butuh koneksi berhak penuh');
    for (const sql of [
      "UPDATE crms_audit.event_log SET outcome='denied'",
      'DELETE FROM crms_audit.event_log',
      'TRUNCATE crms_audit.event_log',
    ]) {
      await assert.rejects(() => su.query(sql),
        (e) => /AUDIT_APPEND_ONLY/.test(e.message), `seharusnya ditolak: ${sql}`);
    }
  } finally { await su.end().catch(() => {}); }
});

test('peran aplikasi tidak memiliki hak DELETE maupun BYPASSRLS', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const r = (await owner.query(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='crms_app'`)).rows[0];
    assert.equal(r.rolbypassrls, false, 'crms_app tidak boleh dapat melewati RLS');
    assert.equal(r.rolsuper, false);

    const deletable = (await owner.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('crms','crms_audit') AND c.relkind='r'
          AND has_table_privilege('crms_app', c.oid, 'DELETE')`)).rows;
    assert.deepEqual(deletable, [], 'tidak satu pun tabel boleh dapat dihapus oleh crms_app');

    const audit = (await owner.query(
      `SELECT has_table_privilege('crms_app','crms_audit.event_log','INSERT') AS ins,
              has_table_privilege('crms_app','crms_audit.event_log','UPDATE') AS upd`)).rows[0];
    assert.equal(audit.ins, true);
    assert.equal(audit.upd, false, 'log audit tidak boleh dapat di-UPDATE oleh aplikasi');

    const ro = (await owner.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('crms','crms_audit') AND c.relkind='r'
          AND (has_table_privilege('crms_readonly', c.oid, 'INSERT')
               OR has_table_privilege('crms_readonly', c.oid, 'UPDATE'))`)).rows[0].n;
    assert.equal(ro, 0, 'peran auditor wajib hanya baca');
  });
});

test('submission tidak dapat berstatus SUBMITTED tanpa tanda terima OJK', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'compliance-1', async (app, tenant) => {
    await app.query(
      `INSERT INTO crms.reporting_cycles
         (tenant_id,id,period_label,cut_off_date,book_versions,mandatory_scenarios,opened_by)
       VALUES($1,'CY-2026','Tahunan 2026','2026-12-31',$2,$3,'head-1') ON CONFLICT DO NOTHING`,
      [tenant, JSON.stringify(['B1@2026', 'B2@2026', 'B3@2026', 'B4@2026', 'B5@2026', 'B6@2026', 'B7@2026']),
        JSON.stringify(['net_zero_2050', 'delayed_transition', 'current_policies'])]);

    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.reporting_cycles
           (tenant_id,id,period_label,cut_off_date,book_versions,mandatory_scenarios,opened_by)
         VALUES($1,'CY-KURANG','Tahunan','2026-12-31',$2,$3,'head-1')`,
        [tenant, JSON.stringify(['B1', 'B2']), JSON.stringify(['a', 'b', 'c'])]),
      (e) => /book_versions/.test(e.message),
      'siklus wajib mencatat versi ketujuh Buku');

    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.reporting_cycles
           (tenant_id,id,period_label,cut_off_date,book_versions,mandatory_scenarios,opened_by)
         VALUES($1,'CY-SKENARIO','Tahunan','2026-12-31',$2,$3,'head-1')`,
        [tenant, JSON.stringify(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']), JSON.stringify(['net_zero_2050'])]),
      (e) => /mandatory_scenarios/.test(e.message),
      'tiga skenario NGFS wajib minimum');

    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.report_submissions(tenant_id,cycle_id,id,status,package_checksum,ojk_receipt_ref)
         VALUES($1,'CY-2026','SUB-1','SUBMITTED',$2,'OJK/2026/0001')`, [tenant, sha('paket')]),
      (e) => /submitted_requires_receipt/.test(e.message),
      'nomor referensi saja tidak cukup; lampiran tanda terima wajib ada');

    await app.query(
      `INSERT INTO crms.report_submissions
         (tenant_id,cycle_id,id,status,package_checksum,ojk_receipt_ref,receipt_attachment_ref,submitted_at)
       VALUES($1,'CY-2026','SUB-1','SUBMITTED',$2,'OJK/2026/0001','blob://receipt-1',now())`,
      [tenant, sha('paket')]);
  });
});

test('gate tahap tidak dapat berstatus PASSED tanpa bukti tersimpan', async (t) => {
  if (skipIfNoDb(t)) return;
  await withApp('CI-A', 'compliance-1', async (app, tenant) => {
    await assert.rejects(
      () => app.query(
        `INSERT INTO crms.cycle_stages(tenant_id,cycle_id,stage_no,stage_key,gate_status)
         VALUES($1,'CY-2026',1,'onboarding','PASSED')`, [tenant]),
      (e) => /gate_pass_requires_evidence/.test(e.message),
      'PASSED tanpa bukti adalah pelanggaran "evidence or it did not happen"');

    await app.query(
      `INSERT INTO crms.cycle_stages
         (tenant_id,cycle_id,stage_no,stage_key,gate_status,gate_evidence,passed_by,passed_at)
       VALUES($1,'CY-2026',1,'onboarding','PASSED',$2,'compliance-1',now())`,
      [tenant, JSON.stringify({ institutionVerified: true, sandboxUatSignedOff: true, ssoActive: true, mfaEnforced: true })]);

    for (const bad of [0, 17]) {
      await assert.rejects(
        () => app.query(
          `INSERT INTO crms.cycle_stages(tenant_id,cycle_id,stage_no,stage_key) VALUES($1,'CY-2026',$2,$3)`,
          [tenant, bad, `x${bad}`]),
        (e) => /stage_no/.test(e.message), `stage_no ${bad} wajib ditolak`);
    }
  });
});

test('residensi data selain ID ditolak skema', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    await assert.rejects(
      () => owner.query(
        `INSERT INTO crms.institutions(code,name,institution_type,currency,data_residency,created_by)
         VALUES('CI-X','SINTETIS X','BUK','IDR','SG','ci-platform')`),
      (e) => /data_residency/.test(e.message));
  });
});

test('enum peran basis data identik dengan 27 peran aplikasi', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const dbRoles = (await owner.query(
      `SELECT e.enumlabel AS r FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.typname='crms_role' ORDER BY e.enumlabel`)).rows.map((x) => x.r);
    assert.equal(dbRoles.length, 27);
    const { ROLE_NAMES } = await import('../src/onprem/iam/roles.js');
    assert.deepEqual(dbRoles, [...ROLE_NAMES].sort(),
      'daftar peran basis data dan src/onprem/iam/roles.js wajib sama persis');
  });
});

test('pemberi hak tidak boleh memberi hak kepada dirinya sendiri', async (t) => {
  if (skipIfNoDb(t)) return;
  await withOwner(async (owner) => {
    const tenant = (await owner.query("SELECT id FROM crms.institutions WHERE code='CI-A'")).rows[0].id;
    await assert.rejects(
      () => owner.query(
        `INSERT INTO crms.memberships(tenant_id,subject,email,role,granted_by)
         VALUES($1,'u-self','u-self@ci.invalid','approver','u-self')`, [tenant]),
      (e) => /granted_by_not_self/.test(e.message));
    await owner.query(
      `INSERT INTO crms.memberships(tenant_id,subject,email,role,granted_by)
       VALUES($1,'u-self','u-self@ci.invalid','approver','admin-1') ON CONFLICT DO NOTHING`, [tenant]);
  });
});
