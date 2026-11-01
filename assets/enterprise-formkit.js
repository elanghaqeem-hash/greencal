/* Schema-driven, accessible forms for CRMS quantitative and regulatory workflows.
   Bank records never persist in the browser. Server remains source of truth and validator. */
(()=>{'use strict';
 const node=(tag,txt,cls)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=txt;if(cls)x.className=cls;return x;};
 const field=(name,label,type='text',other={})=>({name,label,type,...other});
 const object=(name,label,fields,other={})=>field(name,label,'object',{fields,...other});
 const array=(name,label,fields,other={})=>field(name,label,'array',{fields,...other});
 const options=(name,label,choices,other={})=>field(name,label,'select',{choices,...other});
 const scalarNums=new Set(['year','horizonYear','glControlCount','rowCount','stage','ojkTier','dataQualityScore','hazardScore','impactScore','sourcePage','remainingYears','reportingYear','factorYear','couponFrequency','locationRisk','page','book','pageCount','likelihood','severity','hazardLevel','vulnerabilityLevel','reporting_year']);
 const dates=new Set(['asOf','effectiveFrom','effectiveTo','dueDate','maturityDate','activityDate','publicationDate','periodStart','periodEnd','reviewDate']);
 const booleans=new Set(['includeScope2']);
 const longText=new Set(['assumptions','limitations','description','evidence','evidenceReference','methodology','methodologyNotes','executiveSummary','attestation','notes','controls','transmission','mitigation','testCase','businessRule','contentScope','scenarioReference','modelReference','hazardSource','shockAssumption','sourceReference','curveApprovalReference']);
 const choices={
  sourceMethod:['borrower_report','activity_calculator','peer_proxy'],
  emissionSourceMethod:['borrower_report','activity_calculator','peer_proxy'],
  sourceAssuranceStatus:['third_party_assured','not_third_party_assured','unknown'],
  assetClass:['business_loans','listed_equity_corporate_bonds','project_finance','commercial_real_estate','mortgages','motor_vehicle_loans','sovereign_debt'],
  denominatorBasis:['total_equity_and_debt','equity_plus_debt','evic','project_equity_and_debt','property_value_at_origination','vehicle_value_at_origination','ppp_adjusted_gdp'],
  scope:['scope1','scope2','scope3'],
  factorSourceTier:['national','international','ipcc'],
  product:['kpr','other_consumer'],
  stage:['1','2','3'],
  riskBearerType:['debtor','guarantor','underlying_obligor'],
  collateralKind:['cre_rre','non_cre_rre'],
  sectorGroup:['pertanian_kehutanan','pertambangan_penggalian','konstruksi','transportasi_pergudangan','industri_pengolahan','listrik_gas_uap_pendingin','lainnya_non_intensif'],
  accountingClass:['amortized_cost','fvoci','fvtpl'],
  outcome:['approved','rejected'],
  function:['risk','finance','compliance','it','independent_model_validation']
 };
 const arrays={
  exposures:[
   field('facilityRef','ID fasilitas anonim'),field('obligorRef','ID debitur anonim'),
   options('assetClass','Kelas aset',choices.assetClass),field('asOf','Tanggal posisi','date'),field('currency','Mata uang ISO'),
   field('outstanding','Outstanding','decimal'),field('attributionDenominator','Denominator atribusi','decimal'),
   field('denominatorCurrency','Mata uang denominator'),
   options('denominatorBasis','Basis atribusi',choices.denominatorBasis),
   object('emissions','Emisi debitur (tCO₂e)',[
    field('scope1','Scope 1','decimal',{optional:true,nullable:true}),
    field('scope2','Scope 2','decimal',{optional:true,nullable:true}),
    field('scope3','Scope 3','decimal',{optional:true,nullable:true})]),
   field('dataQualityScore','Skor PCAF 1–5','integer',{min:1,max:5}),
   field('ojkTier','OJK Tier 1–4','integer',{min:1,max:4,optional:true,nullable:true}),
   options('emissionSourceMethod','Metode sumber emisi',choices.emissionSourceMethod,{optional:true,nullable:true}),
   field('emissionSourceVintage','Vintage sumber'),field('evidenceReference','Referensi bukti','textarea')
  ],
  points:[field('year','Tahun','integer',{min:2020,max:2100}),field('value','Nilai','decimal',{signed:true})],
  curve:[field('intensity','Intensitas','decimal'),field('damageFraction','Damage ratio (0–1)','decimal')],
  scenarios:[field('key','ID skenario'),field('weight','Bobot (0–1)','decimal'),array('periods','Periode skenario',[
   field('year','Periode tahun 1..N','integer',{min:1,max:30}),field('conditionalPD','PD kondisional (0–1)','decimal'),
   field('lgd','LGD (0–1)','decimal'),field('ead','EAD','decimal')],{minItems:1,maxItems:30})],
  entries:[field('sourceSystem','Sistem sumber'),field('dataset','Nama dataset'),field('asOf','Tanggal posisi','date'),field('sha256','SHA-256','hash'),field('rowCount','Jumlah baris','integer',{min:1}),field('schemaVersion','Versi skema'),field('controlTotal','Control total','decimal',{optional:true,nullable:true}),field('approvalReference','Referensi pengesahan')],
  components:[field('factor','Jenis faktor'),field('exposure','Eksposur','decimal'),field('weight','Bobot','decimal'),field('reference','Referensi koefisien')],
  periods:[field('year','Tahun','integer',{min:1,max:2100}),field('baselinePD','PD dasar','decimal',{optional:true}),field('adjustedPD','PD setelah shock','decimal',{optional:true}),field('pdScalar','Skalar PD','decimal',{optional:true}),field('baselineLGD','LGD dasar','decimal',{optional:true}),field('adjustedLGD','LGD setelah shock','decimal',{optional:true})],
  hqlaSecurityChanges:[field('marketValueChange','Perubahan nilai pasar (signed)','decimal',{signed:true}),field('hqlaHaircut','Haircut (0–1)','decimal')],
  corporateDeposits:[field('balance','Saldo deposito korporasi','decimal'),field('baselineRate','Runoff awal (0–1)','decimal'),field('climateShock','Shock runoff (0–1)','decimal')],
  undrawnCommitments:[field('balance','Saldo fasilitas belum ditarik','decimal'),field('baselineRate','Drawdown awal (0–1)','decimal'),field('climateShock','Shock drawdown (0–1)','decimal')],
  cashInflows:[field('contractualCashflow','Arus kas masuk kontraktual','decimal'),field('climateCkpnRatio','CKPN iklim (0–1)','decimal')],
  coordinates:[],
 };
 const extra={
  ngfs_interpolation:{points:arrays.points},
  portfolio_import:{exposures:arrays.exposures},
  physical_damage:{curve:arrays.curve},
  lifetime_ecl:{scenarios:arrays.scenarios},
  source_manifest:{entries:arrays.entries},
  book7_standardized:{components:arrays.components},
  book7_productive_pd:{periods:[field('year','Tahun','integer',{min:2025,max:2100}),field('baselinePD','PD baseline','decimal'),field('pdScalar','PD skalar','decimal')]},
  book7_ckpn:{periods:[field('baselinePD','PD awal','decimal',{optional:true}),field('adjustedPD','PD setelah shock','decimal',{optional:true}),field('baselineLGD','LGD awal','decimal'),field('adjustedLGD','LGD setelah shock','decimal')]},
  book7_liquidity:{hqlaSecurityChanges:arrays.hqlaSecurityChanges,corporateDeposits:arrays.corporateDeposits,undrawnCommitments:arrays.undrawnCommitments,cashInflows:arrays.cashInflows}
 };
 const overrides={
  book7_annex_lookup:{year:{min:2025,max:2100},table:{label:'Kode tabel Lampiran Buku 7'},size:{optional:true},locationRisk:{optional:true},sector:{optional:true},rating:{optional:true},collateralKind:{optional:true},propertyType:{optional:true},sizeBand:{optional:true},euiClass:{optional:true},granularRating:{optional:true}},
  book7_annex_stress:{year:{min:2025,max:2100},size:{optional:true},locationRisk:{optional:true},sector:{optional:true},rating:{optional:true},collateralKind:{optional:true},propertyType:{optional:true},sizeBand:{optional:true},euiClass:{optional:true},baselinePD:{optional:true},collateralValue:{optional:true},balance:{optional:true},baselineRate:{optional:true},component:{optional:true}},
  book7_mapping:{annualSales:{optional:true,nullable:true},totalAssets:{optional:true,nullable:true},impactScore:{min:0,max:100}},
  book7_ckpn:{remainingYears:{min:1,max:30,optional:true}},
  book7_collateral_lgd:{transitionCost:{optional:true},transitionScalar:{optional:true}},
  book7_retail_npl:{laggedDeltaNplGrowth:{optional:true,signed:true},deltaGdpGrowth:{optional:true,signed:true},laggedDeltaConsumptionGrowth:{optional:true,signed:true}},
  portfolio_import:{glControlTotal:{type:'decimal'},glControlCount:{type:'integer',min:1}},
  source_control:{glControlTotal:{type:'decimal'},glControlCount:{type:'integer',min:1}},
  credit_transmission:{pdDelta:{signed:true},lgdDelta:{signed:true},eadDelta:{signed:true},deltaNetIncome:{signed:true},deltaOperatingCost:{signed:true}},
  capital_bridge:{incrementalEcl:{signed:true},deltaNii:{signed:true},deltaOpex:{signed:true},rwaDelta:{signed:true},otherCapitalDelta:{signed:true}},
  book7_market:{marketYield:{signed:true},rfShock:{signed:true},cs01SignedPerUnitYield:{signed:true},pv01SignedPerUnitYield:{signed:true}},
  book7_capital:{creditPretaxProfitImpact:{signed:true},fvtplMarketValueChange:{signed:true},fvociMarketValueChange:{signed:true}}
 };
 const title=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,x=>x.toUpperCase());
 function describe(name,kind=''){
  const specific=overrides[kind]?.[name]||{};
  if(name==='hazard'&&kind==='geospatial_overlay')return object(name,'Polygon GeoJSON',[
    field('type','Tipe','select',{choices:['Polygon']}),field('coordinates','Rings GeoJSON (array of [lon,lat])','json')]);
  if(name==='coordinates'&&kind==='geospatial_overlay')return field(name,'Koordinat WGS84 [longitude,latitude]','json');
  if((extra[kind]||{})[name]||arrays[name])return array(name,title(name),extra[kind]?.[name]||arrays[name],{
   minItems:['points','curve'].includes(name)?2:['hqlaSecurityChanges','corporateDeposits','undrawnCommitments','cashInflows'].includes(name)?0:1,
   maxItems:name==='exposures'?100:name==='curve'?40:name==='scenarios'?10:name==='points'?200:300,
   optional:['hqlaSecurityChanges','corporateDeposits','undrawnCommitments','cashInflows'].includes(name)});
  if(specific.type)return field(name,specific.label||title(name),specific.type,specific);
  if(choices[name])return options(name,title(name),choices[name],specific);
  if(scalarNums.has(name))return field(name,title(name),'integer',specific);
  if(dates.has(name))return field(name,title(name),'date',specific);
  if(booleans.has(name))return field(name,title(name),'boolean',{optional:true,...specific});
  if(/sha256/i.test(name))return field(name,title(name),'hash',specific);
  if(/url$/i.test(name))return field(name,title(name),'url',specific);
  if(longText.has(name))return field(name,title(name),'textarea',specific);
  if(['glControlTotal','outstanding','assetValue','basePD','baseLGD','baseEAD','pdDelta','lgdDelta','eadDelta','eir','carbonPrice','reductionFraction','hazardIntensity','baselineCKPN','balance','totalLoans','rate','baselineCapital','baselineHqla','baselineOutflows','baselineInflows','hqlaHaircut','weight','yearValue','couponRate','marketYield','baselineRate','adjustedPD','adjustedLGD','pdScalar','baselinePD','baselineLGD','transitionCost','transitionScalar','financialImpact','collateralValue','ead','totalAssets','annualSales','scope1','scope2','scope3','deltaGdpGrowth','previousQuarterNplRate'].includes(name)||/^(delta|opening|adjusted|baseline|fvtpl|fvoci|incremental|eligible|other|total|physical|lagged|effective|carbon|price|reduction|attribution|factorKg|co2Kg|ch4Gram|n2oGram|activityQuantity)/i.test(name))
   return field(name,title(name),'decimal',specific);
  return field(name,specific.label||title(name),'text',specific);
 }
 function forAnalytics(id,keys){return keys.map(k=>describe(k,id));}
 function forExample(example,kind=''){
  return Object.entries(example).map(([key,value])=>{
   const known=describe(key,kind);
   if(value!==null&&typeof value==='object'&&!Array.isArray(value))return object(key,title(key),forExample(value,kind),{optional:false});
   if(Array.isArray(value))return array(key,title(key),extra[kind]?.[key]||arrays[key]||[],{minItems:1});
   if(typeof value==='boolean')return field(key,title(key),'boolean',{optional:true});
   if(typeof value==='number')return field(key,title(key),'integer');
   if(key==='year'||key==='reportingYear'||key==='factorYear')return field(key,title(key),'text',{pattern:'20[0-9]{2}'});
   return known;
  });
 }
 function mount(host,schema,{values={},onChange}={}){
  const controllers={};
  host.replaceChildren();
  let seq=0;
  function draw(where,definitions,initial={},prefix=''){
   const reads={};
   for(const def of definitions){
    const key=def.name,full=prefix+key,v=initial?.[key],label=def.label||title(key);
    if(def.type==='object'){
     const fs=node('fieldset',undefined,'formkit-group'),legend=node('legend',label);fs.append(legend);
     const nested=draw(fs,def.fields||[],v||{},full+'.');where.append(fs);
     reads[key]=()=>nested();continue;
    }
    if(def.type==='array'){
     const fs=node('fieldset',undefined,'formkit-group'),legend=node('legend',label+' (daftar)'),items=node('div',undefined,'formkit-rows');
     const controls=[];fs.append(legend,items);
     const add=node('button','+ Tambah baris','formkit-add');add.type='button';
     function appendItem(value={}){
      const index=controls.length+1,box=node('div',undefined,'formkit-row'),head=node('div',undefined,'formkit-row-head'),caption=node('strong','Baris '+index),del=node('button','Hapus baris');
      del.type='button';head.append(caption,del);box.append(head);
      const grid=node('div',undefined,'formkit-grid');box.append(grid);
      const getter=draw(grid,def.fields||[],value,full+'['+index+'].');
      const item={box,getter};controls.push(item);
      del.onclick=()=>{const ix=controls.indexOf(item);if(ix>=0)controls.splice(ix,1);box.remove();controls.forEach((x,i)=>{x.box.querySelector('strong').textContent='Baris '+(i+1);});onChange?.();};
      items.append(box);
     }
     add.onclick=()=>{if(controls.length>=(def.maxItems||100))return;appendItem();onChange?.();};
     fs.append(add);where.append(fs);
     if(Array.isArray(v))v.forEach(appendItem);
     reads[key]=()=>{
      const limit=def.minItems??(def.optional?0:1);
      if(controls.length<limit)throw Error(label+' minimal '+limit+' baris.');
      if(controls.length>(def.maxItems||300))throw Error(label+' melebihi jumlah baris maksimum.');
      return controls.map(x=>x.getter());
     };continue;
    }
    const wrap=node('label',undefined,'formkit-field'),name=node('span',label+(def.optional?'':' *'));
    let control;
    if(def.type==='boolean'){control=node('input');control.type='checkbox';control.checked=v===true;wrap.className+=' formkit-boolean';}
    else if(def.type==='select'){
     control=node('select');const blank=node('option','Pilih…');blank.value='';control.append(blank);
     for(const choice of def.choices||[]){const o=node('option',choice);o.value=choice;control.append(o);}control.value=v==null?'':String(v);
    }else if(['textarea','json'].includes(def.type)){control=node('textarea');control.rows=def.type==='json'?4:3;control.value=v==null?'':def.type==='json'?JSON.stringify(v):String(v);}
    else{
     control=node('input');control.type=def.type==='integer'?'number':def.type==='date'?'date':def.type==='url'?'url':'text';control.value=v==null?'':String(v);
     if(def.type==='integer'){control.step='1';if(def.min!==undefined)control.min=String(def.min);if(def.max!==undefined)control.max=String(def.max);}
     if(def.type==='decimal'){control.inputMode='decimal';control.placeholder=def.signed?'Contoh: -0.25':'Contoh: 0.25';}
     if(def.type==='hash'){control.maxLength=64;control.placeholder='64 karakter SHA-256 heksadesimal';}
     if(def.type==='text')control.maxLength=def.maxLength||500;
     if(def.pattern)control.pattern=def.pattern;
    }
    control.name=full;control.id='gc-formkit-'+(++seq);
    control.required=!def.optional&&def.type!=='boolean';
    wrap.append(name,control);where.append(wrap);
    if(['textarea','json'].includes(def.type))wrap.className+=' formkit-wide';
    if(def.hint)wrap.append(node('small',def.hint));
    reads[key]=()=>{
     if(def.type==='boolean')return control.checked;
     const raw=control.value.trim();
     if(raw===''){
      if(def.nullable)return null;
      if(def.optional)return undefined;
      throw Error(label+' wajib diisi.');
     }
     if(def.type==='hash'&&!/^[a-f0-9]{64}$/i.test(raw))throw Error(label+' wajib SHA-256 64 karakter.');
     if(def.type==='integer'){
      const n=Number(raw);
      if(!Number.isSafeInteger(n)||(def.min!==undefined&&n<def.min)||(def.max!==undefined&&n>def.max))throw Error(label+' harus bilangan bulat sesuai rentang.');
      return n;
     }
     if(def.type==='decimal'&&!(def.signed?/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,24})?$/:/^(?:0|[1-9]\d{0,17})(?:\.\d{1,24})?$/).test(raw))throw Error(label+' harus desimal (titik sebagai pemisah).');
     if(def.type==='url'&&!/^https:\/\/[^ ]+$/i.test(raw))throw Error(label+' harus URL HTTPS.');
     if(def.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString().slice(0,10)!==raw))throw Error(label+' tanggal tidak valid.');
     if(def.pattern&&!(new RegExp('^(?:'+def.pattern+')$')).test(raw))throw Error(label+' format tidak sesuai.');
     if(def.type==='select'&&!(def.choices||[]).includes(raw))throw Error(label+' pilih nilai valid.');
     if(def.name==='stage'&&def.type==='select')return Number(raw);
     if(def.type==='json'){let p;try{p=JSON.parse(raw);}catch{throw Error(label+' JSON tidak valid.');}return p;}
     return raw;
    };
   }
   return ()=>Object.fromEntries(Object.entries(reads).map(([k,read])=>[k,read()]).filter(([,v])=>v!==undefined));
  }
  const grid=node('div',undefined,'formkit-grid');host.append(grid);const read=draw(grid,schema,values);
  return {getValue:read,replace(value){return mount(host,schema,{values:value,onChange});}};
 }
 window.GreenCalFormKit={field,object,array,options,arrays,describe,forAnalytics,forExample,mount};
})();