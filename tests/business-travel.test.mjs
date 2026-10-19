import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=html.indexOf('id="baseline">')+'id="baseline">'.length;
const end=html.indexOf("</script>",start);
assert.ok(start>20&&end>start,"baseline JSON not found");
const base=JSON.parse(html.slice(start,end));
const a=html.indexOf('  {\n    id: "s3_c6",');
const b=html.indexOf('  {\n    id: "s3_c7",',a);
assert.ok(a>0&&b>a,"Scope3 category 6 not found");
const c6Source=html.slice(a,b).trim().replace(/,\s*$/,"");
const R=(table,key,year)=>{
  const row=base.tables[table]?.find(x=>x.key===key&&x.validFrom<=year&&x.validTo>=year);
  if(!row)throw new Error("Missing factor "+table+"/"+key+"/"+year);
  return row;
};
const conv=(v,from,to)=>{
  if(from===to)return v;
  if(from==="km"&&to==="mile")return v/1.609344;
  if(from==="mile"&&to==="km")return v*1.609344;
  if(from==="liter"&&to==="gallon")return v/3.785411784;
  return null;
};
const num=v=>v===""||v==null?null:Number.isFinite(Number(v))?Number(v):null;
const nn=v=>v??0;
const cat=new Function("SEL","NUM","OPT","show","rowUnits","R","num","conv","K","keyOf","nn","nfa","nfx",
  "return ("+c6Source+");")(
  (k,label,table,opt)=>({k,label,t:"sel",table,...opt}),
  (k,label,opt)=>({k,label,t:"num",...opt}),
  (k,label,opts,opt)=>({k,label,t:"opt",opts,...opt}),
  (k,...values)=>i=>values.includes(i[k]),()=>()=>[],R,num,conv,
  ()=>base.consts,s=>String(s).replace(/[^A-Za-z0-9]+/g,"-").toUpperCase(),nn,String,String
);
const gwpCH4=R("gwp","METHANE",2026).gwp,gwpN2O=R("gwp","NITROUS-OXIDE",2026).gwp;
function calc(input){
  const r=cat.calc(input,2026);
  const kg=nn(r.co2)+(nn(r.ch4)/1000)*gwpCH4+(nn(r.n2o)/1000)*gwpN2O+nn(r.oth);
  assert.ok(Number.isFinite(kg)&&kg>=0,"valid nonnegative emission");
  return {kg,refs:r.refs,explanation:r.L.join(" ")};
}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<Math.max(1e-7,Math.abs(expected)*1e-9),
  "expected "+expected+" kg, got "+actual+" kg");}

test("original validated OJK 2026 travel/flight/hotel factors remain the source",()=>{
  assert.ok(base.tables.travel.some(r=>r.key==="HOTEL-GUEST-NIGHT"));
  assert.ok(base.tables.travel.some(r=>r.key==="HOTEL-IDR"));
  assert.ok(base.tables.travel.some(r=>r.key==="SHIP-PASSENGER-MILES"));
  assert.ok(base.tables.flight.some(r=>r.key==="BUSINESS-LONG-HAUL"));
  assert.equal(cat.s,"3");
  assert.match(cat.ref,/Cat 6/);
});

test("flight records distinguish domestic and international without inventing geographical factors",()=>{
 const domestic=calc({m:"udara",region:"domestik",cls:"Economy",dist:"950",pax:"2",trip:"sj"});
 const international=calc({m:"udara",region:"internasional",cls:"Economy",dist:"950",pax:"2",trip:"sj"});
 const expected=950*2*R("flight","ECONOMY-MEDIUM-HAUL",2026).perKm;
 close(domestic.kg,expected);
 close(international.kg,expected);
 assert.match(domestic.explanation,/Domestik/);
 assert.match(international.explanation,/Internasional/);
 assert.match(international.explanation,/bukan faktor geografis terpisah/);
 const premium=calc({m:"udara",region:"internasional",cls:"Business",dist:"4300",pax:"1",trip:"pp"});
 close(premium.kg,4300*2*R("flight","BUSINESS-LONG-HAUL",2026).perKm);
});

test("bus, taxi, rail and city-rail factors apply correct passenger-km and return-trip units",()=>{
 const modes=[["bus","BUS-PASSENGER-MILES"],["taxi","TAXI-PASSENGER-MILES"],
  ["train","TRAIN-PASSENGER-MILES"],["city_rail","CITY-RAIL-PASSENGER-MILES"]];
 for(const [land,key] of modes){
  const r=R("travel",key,2026);
  const calculated=calc({m:"darat",land,basis:"distance",dist:"100",pax:"2",trip:"pp"});
  const kmFactor=(r.co2+r.ch4*gwpCH4+r.n2o*gwpN2O)/1.609344;
  close(calculated.kg,100*2*2*kmFactor);
  assert.equal(calculated.refs[0][1],key);
 }
});

test("rental car and motorcycle use per-vehicle factors, not per passenger",()=>{
 for(const [land,key] of [["car","CAR-MILES"],["motorbike","MOTORBIKE-MILES"]]){
  const one=calc({m:"darat",land,basis:"distance",dist:"50",pax:"1",trip:"sj"});
  const more=calc({m:"darat",land,basis:"distance",dist:"50",pax:"4",trip:"sj"});
  close(one.kg,more.kg);
  assert.equal(one.refs[0][1],key);
 }
});

test("rail ticket/spend and bus fare are total spending, not re-multiplied",()=>{
 const r=R("travel","BUS-IDR",2026);
 const one=calc({m:"darat",land:"bus",basis:"spend",expense:"300000",pax:"8",trip:"pp"});
 close(one.kg,300000*r.co2);
 assert.match(one.explanation,/Metode berbasis biaya/);
});

test("ferry and speedboat distance clearly explain the approximation",()=>{
 for(const sea of ["ferry","speedboat"]){
  const r=calc({m:"laut",sea,basis:"distance",dist:"26",pax:"3",trip:"sj"});
  assert.equal(r.refs[0][1],"SHIP-PASSENGER-MILES");
  assert.match(r.explanation,/pendekatan/);
  assert.ok(r.kg>0);
 }
});


test("ferry and speedboat menus use concise terminology without unwanted labels",()=>{
 for(const unwanted of ["proxy kapal penumpang","butuh validasi faktor"]){
  assert.equal(html.toLowerCase().includes(unwanted),false,"unexpected label: "+unwanted);
 }
 for(const display of ['["ferry","Kapal feri"]','["speedboat","Speedboat / kapal cepat"]']){
  assert.ok(html.includes(display),"expected clean option "+display);
 }
 assert.match(html,/faktor kapal penumpang sebagai pendekatan/);
});
test("sea operator fuel derives from original OJK per-gallon factors",()=>{
 const diesel=R("mobile","MINYAK-DIESEL",2026);
 const result=calc({m:"laut",sea:"speedboat",basis:"fuel",fuelType:"MINYAK-DIESEL",fuelLiters:"35"});
 close(result.kg,35/3.785411784*diesel.co2);
 assert.match(result.explanation,/Scope 1/);
});

test("hotel guest-night and rupiah alternative are not combined or multiplied by rooms",()=>{
 const ef=R("travel","HOTEL-GUEST-NIGHT",2026).co2;
 const hotel=calc({m:"hotel",hotelBasis:"guestnight",guests:"2",nights:"3",rooms:"5",hotelClass:"5"});
 close(hotel.kg,2*3*ef);
 const rate=R("travel","HOTEL-IDR",2026).co2;
 const cost=calc({m:"hotel",hotelBasis:"spend",hotelExpense:"1500000",guests:"100",nights:"14"});
 close(cost.kg,1500000*rate);
 assert.match(hotel.explanation,/jangan dihitung ganda/);
});

test("invalid zero, missing or negative activity values are not silently counted",()=>{
 const invalid=[
  {m:"udara",dist:"",cls:"Economy",pax:"1",trip:"sj"},
  {m:"darat",land:"bus",basis:"distance",dist:"100",pax:"0",trip:"sj"},
  {m:"laut",sea:"speedboat",basis:"fuel",fuelLiters:"-5"},
  {m:"hotel",hotelBasis:"guestnight",guests:"0",nights:"1"},
  {m:"hotel",hotelBasis:"spend",hotelExpense:""}
 ];
 for(const x of invalid)assert.throws(()=>calc(x),/Masukkan/);
});

test("existing historical travel entries remain calculable",()=>{
 const result=calc({m:"jarak",code:"HOTEL-GUEST-NIGHT",qty:"5"});
 close(result.kg,5*R("travel","HOTEL-GUEST-NIGHT",2026).co2);
 const legacyFlight=calc({m:"udara",cls:"Economy",dist:"950",pax:"12",trip:"pp"});
 assert.ok(legacyFlight.kg>0);
});

test("wizard provides all categories, real calculation and factor catalog; mobile CSS retains hidden panels",()=>{
 for(const token of ["wzD_mode","wzD_land","wzD_sea","wzD_hotelBasis","wzD_fuelLiters",
 "wzD_region","wzD_hotelCity","wzD_guests","wzD_nights","wzD_expense","wzD_factorCatalog"])
  assert.match(html,new RegExp(token));
 assert.ok(html.includes(".gc-business-travel-wizard [hidden]"));
 assert.match(html,/S\.entries\.unshift\(entry\)/);
 assert.match(html,/scope 3/i);
});

test("complete inline application script parses",()=>{
 const block=html.slice(html.lastIndexOf("<script>")+8,html.indexOf("</script>", html.lastIndexOf("<script>")));
 assert.ok(block.length>200000);
 assert.doesNotThrow(()=>new Function(block));
});
