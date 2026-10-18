// Deterministic mock API server for real-browser frontend tests.
// No production secrets, user records, or D1 credentials are used.
import http from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {randomBytes} from "node:crypto";
const base=process.cwd(),store=new Map();
const json=(res,status,obj,cookie)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...(cookie?{"set-cookie":cookie}:{})});res.end(JSON.stringify(obj));};
const cookieId=req=>/\bgc_guest=([a-f0-9]{64})\b/.exec(req.headers.cookie||"")?.[1];
const readBody=async req=>{let str="";for await(const chunk of req){str+=chunk;if(str.length>2000000)throw Error("oversize");}return JSON.parse(str);};
http.createServer(async(req,res)=>{
 const u=new URL(req.url,"http://127.0.0.1:4173"),path=u.pathname;
 if(path==="/api/public/state"||path.startsWith("/api/ai/")){
   let id=cookieId(req),setCookie;
   if(!id){id=randomBytes(32).toString("hex");setCookie="gc_guest="+id+"; Path=/; HttpOnly; SameSite=Strict";}
   const item=store.get(id)||{revision:0,data:null};
   if(path==="/api/public/state"){
     if(req.method==="GET")return json(res,200,item,setCookie);
     if(req.method!=="PUT")return json(res,405,{error:"method"});
     if(setCookie)return json(res,428,{error:"initialization"});
     try{
       const input=await readBody(req);
       if(input.revision!==item.revision)return json(res,409,{error:"revision conflict"});
       store.set(id,{revision:item.revision+1,data:input.data});
       return json(res,200,{ok:true,revision:item.revision+1});
     }catch{return json(res,400,{error:"invalid state"});}
   }
   if(path==="/api/ai/status")return json(res,200,{ok:true,role:"public",config:{order:[]} },setCookie);
   if(path==="/api/ai/analyze"){
     if(req.method!=="POST")return json(res,405,{error:"method"});
     try{
       await readBody(req);
       return json(res,200,{ok:true,narrative:"Analisis berbasis angka dan input disajikan sebagai draf untuk ditinjau. Data terverifikasi tetap diperlukan sebelum dipakai dalam laporan resmi.",provider:"gemini",model:"gemini-mock",failedProviders:[],generatedAt:new Date().toISOString()});
     }catch{return json(res,400,{error:"input"});}
   }
   return json(res,404,{error:"not found"});
 }
 let file=path==="/"?"/index.html":path;
 try{
   file=decodeURIComponent(file);
   if(file.includes(".."))throw Error("traversal");
   const allowed=new Set(["/index.html","/auth-client.js","/assets/brks-syariah.svg"]);
   if(!allowed.has(file))throw Error("not found");
   const bytes=await readFile(resolve(base,"."+file));
   const mime=extname(file)===".html"?"text/html; charset=utf-8":extname(file)===".js"?"application/javascript":"image/svg+xml";
   res.writeHead(200,{"content-type":mime});res.end(bytes);
 }catch{res.writeHead(404);res.end("not found");}
}).listen(4173,"127.0.0.1",()=>console.log("GreenCal browser test server listening"));
