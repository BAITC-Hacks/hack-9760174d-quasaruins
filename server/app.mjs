import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DATASET, EXAMPLE_PLAN } from '../shared/city-data.js';
import { BASELINE, simulatePlan } from '../shared/simulation.js';
import { suggestPlan, validateLocks } from '../shared/optimizer.js';
import { getAdvice } from './adviser.mjs';

export const ROOT=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function readJSON(req) {
  if (!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) {req.resume();throw fail(415,'Send application/json.');}
  const parts=await new Promise((resolve,reject)=>{
    let size=0,finished=false; const chunks=[];
    req.on('data',chunk=>{
      if(finished)return;
      size+=chunk.length;
      if(size>64*1024){finished=true;chunks.length=0;reject(fail(413,'Request is too large.'));return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{if(!finished){finished=true;resolve(chunks);}});
    req.on('error',()=>{if(!finished){finished=true;reject(fail(400,'Request interrupted.'));}});
  });
  let body;
  try {body=JSON.parse(Buffer.concat(parts).toString('utf8'));} catch {throw fail(400,'Invalid JSON.');}
  if (!body || typeof body!=='object' || Array.isArray(body)) throw fail(400,'Send a JSON object.');
  return body;
}

export function createAppServer({root=ROOT,apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL||'gpt-4.1-mini',adviceFn=getAdvice}={}) {
  let activeAdvice=0,geoPromise;
  const adviceCache=new Map();
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    const send=(status,data)=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(data));
    };
    try {
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'')) throw fail(403,'Use a localhost address.');
      const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
      if (path.startsWith('/api/')) {
        if (req.method==='GET' && path==='/api/health') return send(200,{ok:true,aiConfigured:Boolean(apiKey),model,datasetVersion:DATASET.version});
        if (req.method==='GET' && path==='/api/dataset') return send(200,{dataset:DATASET,examplePlan:EXAMPLE_PLAN,baseline:BASELINE});
        if (req.method==='GET' && path==='/api/geography') {
          geoPromise??=readFile(resolve(root,'data/astana.json')).then(raw=>({raw,gzip:gzipSync(raw)})).catch(error=>{geoPromise=undefined;throw error;});
          const geo=await geoPromise,compressed=/\bgzip\b/.test(req.headers['accept-encoding']||'');
          res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'public, max-age=3600','Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});
          return res.end(compressed?geo.gzip:geo.raw);
        }
        if (req.method!=='POST' || !['/api/simulate','/api/suggest','/api/advice'].includes(path)) throw fail(404,'API endpoint not found.');
        if (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) throw fail(403,'Cross-origin requests are not allowed.');
        const body=await readJSON(req),result=simulatePlan(body.selections);
        if(path==='/api/simulate' || !result.valid) return send(result.valid?200:422,result);
        const lockedMeasureIds=body.lockedMeasureIds??[];
        if (!validateLocks(result.selections,lockedMeasureIds)) throw fail(422,'Locks must be unique project IDs in the current plan.');
        if (path==='/api/suggest') return send(200,suggestPlan(result.selections,{lockedMeasureIds}));
        if (body.question!==undefined && (typeof body.question!=='string'||body.question.length>1500)) throw fail(400,'Question must be text of at most 1500 characters.');
        if (body.language!==undefined && !['en','ru'].includes(body.language)) throw fail(400,'Choose en or ru.');
        const input={selections:result.selections,lockedMeasureIds,question:body.question||'',language:body.language||'en'};
        const cacheKey=JSON.stringify(input),cached=adviceCache.get(cacheKey);
        if (cached && Date.now()-cached.time<300000) return send(200,cached.value);
        if (activeAdvice>=2) throw fail(429,'The adviser is busy. Please try again shortly.');
        activeAdvice++;
        try {
          const value=await adviceFn(input,{apiKey,model});
          if (adviceCache.size>=30) adviceCache.delete(adviceCache.keys().next().value);
          adviceCache.set(cacheKey,{time:Date.now(),value});return send(200,value);
        } finally {activeAdvice--;}
      }
      if (!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed.');
      if (path.split('/').some(part=>part.startsWith('.')) || path.includes('\\') || path.includes('\0')) throw fail(404,'Not found.');
      const shared=path.startsWith('/shared/');
      if(shared && !['/shared/city-data.js','/shared/simulation.js','/shared/optimizer.js'].includes(path)) throw fail(404,'Not found.');
      const base=resolve(root,shared?'shared':'public'),relative=shared?path.slice(8):path==='/'?'index.html':path.slice(1);
      const target=resolve(base,relative);
      if (!target.startsWith(base+sep)) throw fail(404,'Not found.');
      const actual=await realpath(target);
      if (!actual.startsWith(base+sep)) throw fail(404,'Not found.');
      const mime=types[extname(actual)];
      if(!mime || !(await stat(actual)).isFile()) throw fail(404,'Not found.');
      const bytes=await readFile(actual);
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':path.startsWith('/vendor/')?'public, max-age=86400':'no-cache'});
      res.end(req.method==='HEAD'?undefined:bytes);
    } catch(error) {
      const status=error.status || (error.code==='ENOENT'?404:error instanceof URIError?400:500);
      if(!res.headersSent) send(status,{error:status===500?'Server could not complete the request.':error.status?error.message:status===404?'Not found.':'Invalid URL.'});
      else res.end();
    }
  });
}
