import {KitchenError,publicErrorMessage} from './kitchen-errors.mjs';
import {env} from 'cloudflare:workers';
import type {Model,Provider,Run} from './kitchen-types';
import {chooseModels,prepareProviderRequest,readProviderResult,textModel} from './kitchen-core.mjs';
import {performStep} from './kitchen-engine.mjs';
import {assertPricingFresh,estimateOrder,parseBudget,rateFor,RATES,PRICING_DATE,PRICING_VERSION,ledger,reserveCost} from './kitchen-money.mjs';
import {firstWorker,planAction,applyAction,buildTaskInput} from './kitchen-workflow.mjs';
import type {PriceRate} from './kitchen-types';

type Secrets={OPENAI_API_KEY?:string;ANTHROPIC_API_KEY?:string;KITCHEN_VAULT_KEY?:string;DB?:D1Database};
type Keys={openai?:string;anthropic?:string};
const runtime=()=>env as unknown as Secrets;
const database=()=>{const db=runtime().DB;if(!db)throw new KitchenError("Order storage is not configured yet.");return db;};
const now=()=>new Date().toISOString();
export function identity(request:Request){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)throw new KitchenError("Sign in with ChatGPT to open your kitchen.",401);
 if(request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new KitchenError("Cross-site request rejected.");if(!request.headers.get('content-type')?.includes('application/json'))throw new KitchenError("A JSON request is required.");}
 return user;
}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
function unb64(text:string){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function vaultKey(){const secret=runtime().KITCHEN_VAULT_KEY;if(!secret)throw new KitchenError("Secure key storage is not configured yet.");const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function getKeys(user:string):Promise<Keys>{
 const base:Keys={openai:runtime().OPENAI_API_KEY,anthropic:runtime().ANTHROPIC_API_KEY};
 const row=await database().prepare('SELECT ciphertext,iv FROM kitchen_keys WHERE owner=?').bind(user).first<{ciphertext:string;iv:string}>();if(!row)return base;
 try{const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:new TextEncoder().encode(user)},await vaultKey(),unb64(row.ciphertext));return {...base,...JSON.parse(new TextDecoder().decode(clear))};}catch{throw new KitchenError("Could not decrypt the saved keys. Update the connection in settings.");}
}
async function saveKeys(user:string,keys:Keys){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(user)},await vaultKey(),new TextEncoder().encode(JSON.stringify(keys)));await database().prepare('INSERT INTO kitchen_keys(owner,ciphertext,iv,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_at=excluded.updated_at').bind(user,b64(new Uint8Array(ciphertext)),b64(iv),now()).run();}
function providerError(provider:Provider,status:number){const name=provider==='openai'?'OpenAI':'Anthropic';return status===401||status===403?`${name}: key rejected or model access unavailable.`:status===429?`${name}: quota or balance exhausted. No automatic retry was made.`:`${name}: service error (${status}). No automatic retry was made.`;}
async function providerModels(provider:Provider,key:string):Promise<Model[]>{
 const models:Model[]=[];let after='';
 for(let page=0;page<20;page++){
  const url=provider==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):'');
  const headers:Record<string,string>=provider==='openai'?{Authorization:`Bearer ${key}`}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!response.ok)throw new KitchenError(providerError(provider,response.status));
  const result=await response.json() as {data?:{id:string;display_name?:string;lifecycle?:string}[];has_more?:boolean;last_id?:string};if(!Array.isArray(result.data))throw new KitchenError(`${provider}: invalid model catalog.`);
  models.push(...result.data.filter(m=>typeof m.id==='string').map(m=>({provider,id:m.id,name:m.display_name||m.id,lifecycle:m.lifecycle})));
  if(provider==='openai'||!result.has_more)break;if(!result.last_id||result.last_id===after)throw new KitchenError("The model catalog returned an invalid page.");after=result.last_id;if(page===19)throw new KitchenError("The catalog is too large. Could not load every page.");
 }
 return models;
}
export async function getSettings(user:string,withModels=true){const keys=await getKeys(user);const models:Model[]=[];const errors:Partial<Record<Provider,string>>={};if(withModels)await Promise.all((['openai','anthropic'] as const).map(async provider=>{if(!keys[provider])return;try{models.push(...await providerModels(provider,keys[provider]!));}catch(error){errors[provider]=publicErrorMessage(error,"Could not verify the connection. Please try again.");}}));return {openai:Boolean(keys.openai),anthropic:Boolean(keys.anthropic),vaultReady:Boolean(runtime().KITCHEN_VAULT_KEY),models,errors};}
export async function updateSettings(user:string,value:Record<string,unknown>){
 const keys=await getKeys(user);let changed=false;
 for(const provider of ['openai','anthropic'] as const){if(typeof value[provider]==='string'&&value[provider]){const key=(value[provider] as string).trim();if(key.length<20||key.length>512||/\s/.test(key))throw new KitchenError("Check the API key format.");await providerModels(provider,key);keys[provider]=key;changed=true;}}
 if(!changed)throw new KitchenError("Enter at least one new API key.");await saveKeys(user,keys);return getSettings(user);
}
function decodeRow(row:any):Run{return {...JSON.parse(row.state),status:row.status,paused:Boolean(row.paused),leaseUntil:row.lease_until,uncertain:Boolean(row.lease&&row.lease_until<Date.now())};}
const repository={
 async load(id:string,user:string){const row=await database().prepare('SELECT * FROM kitchen_runs WHERE id=? AND owner=?').bind(id,user).first();return row?decodeRow(row):null;},
 async acquire(id:string,user:string){const lease=crypto.randomUUID();const result=await database().prepare("UPDATE kitchen_runs SET lease=?,lease_until=?,status='running',updated_at=? WHERE id=? AND owner=? AND lease IS NULL AND status='ready' AND paused=0").bind(lease,Date.now()+180000,now(),id,user).run();return result.meta.changes===1?lease:null;},
 async save(id:string,user:string,lease:string,run:Run,release:boolean){const sql=release?"UPDATE kitchen_runs SET state=?,title=?,status=CASE WHEN status='cancelled' THEN 'cancelled' ELSE ? END,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND owner=? AND lease=?":"UPDATE kitchen_runs SET state=?,title=?,updated_at=? WHERE id=? AND owner=? AND lease=? AND status='running' AND paused=0";const args=release?[JSON.stringify(run),run.title,run.status,now(),id,user,lease]:[JSON.stringify(run),run.title,now(),id,user,lease];const result=await database().prepare(sql).bind(...args).run();if(!release&&result.meta.changes!==1)return false;if(result.meta.changes!==1)throw new KitchenError("Could not save the result: the order state changed.");return true;}
};
export async function listRuns(user:string){const rows=await database().prepare("SELECT id,title,status,paused,created_at FROM kitchen_runs WHERE owner=? AND status!='draft' ORDER BY created_at DESC LIMIT 30").bind(user).all();return rows.results;}
export async function loadRun(user:string,id:string){return repository.load(id,user);}
export async function createRun(user:string,value:Record<string,unknown>){
 if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>8000)throw new KitchenError("Describe your project using 1–8000 characters.");
 const mode=value.mode;if(mode!=='economy'&&mode!=='balance'&&mode!=='quality')throw new KitchenError("Select a work mode.");const maxOutput=Number(value.maxOutput);if(![1024,2048,4096,8192].includes(maxOutput))throw new KitchenError("Select a response limit.");
 const budgetMicros=parseBudget(value.budgetUsd);assertPricingFresh();
 const settings=await getSettings(user);const availabilityVerified=Boolean(settings.openai&&settings.anthropic&&!Object.keys(settings.errors).length);
 const catalogue=availabilityVerified?settings.models.filter(m=>rateFor(m.provider,m.id)):RATES.map(r=>({provider:r.provider,id:r.id}));
 const workMode=value.workMode===undefined?'auto':value.workMode;if(workMode!=='auto'&&workMode!=='single')throw new KitchenError("Select the team size.");
 const selected=chooseModels(catalogue,mode);if(workMode==='single')selected.chief=firstWorker(catalogue,mode);
 const estimate=estimateOrder(value.prompt.trim(),maxOutput,selected,workMode==='single');
 const rates=Object.fromEntries(catalogue.map(m=>[m.provider+'/'+m.id,rateFor(m.provider,m.id)])) as Record<string,PriceRate>;
 const run:Run={id:crypto.randomUUID(),owner:user,title:workMode==='single'?value.prompt.trim().slice(0,70):"New project",prompt:value.prompt.trim(),mode,workMode,maxOutput,status:'draft',paused:false,createdAt:now(),catalogue:catalogue as Model[],budgetMicros,pricingDate:PRICING_DATE,pricingVersion:PRICING_VERSION,rates,estimate,quoteExpiresAt:Date.now()+15*60000,availabilityVerified,tasks:[{id:'chef',role:workMode==='single'?"Solo chef":"Head chef",...(workMode==='single'?{kind:'work' as const}:{}),task:workMode==='single'?value.prompt.trim():"Analyze the request: solve it directly or assign the necessary team.",provider:selected.chief.provider,model:selected.chief.id,dependsOn:[],status:'queued',output:'',usage:null}]};
 await database().prepare('INSERT INTO kitchen_runs(id,owner,title,status,paused,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(run.id,user,run.title,run.status,0,JSON.stringify(run),run.createdAt,now()).run();return run;
}
export async function startRun(user:string,id:string){
 const run=await repository.load(id,user);if(!run||run.status!=='draft')throw new KitchenError("This estimate has already started or is unavailable.");
 assertPricingFresh(run.pricingDate);if(!run.quoteExpiresAt||Date.now()>run.quoteExpiresAt||run.pricingVersion!==PRICING_VERSION)throw new KitchenError("Estimate expired. Calculate it again before starting.");
 if(!Number.isSafeInteger(run.budgetMicros)||!run.budgetMicros)throw new KitchenError("This estimate has no budget.");
 const settings=await getSettings(user);if(!settings.openai||!settings.anthropic||Object.keys(settings.errors).length)throw new KitchenError("Connect and verify both providers to start. The estimate was calculated for free.");
 if([run.tasks[0],...run.catalogue.map(m=>({provider:m.provider,model:m.id}))].some(m=>!settings.models.some(a=>a.provider===m.provider&&a.id===m.model)))throw new KitchenError("Available models have changed. Calculate a new estimate.");
 if(Date.now()>run.quoteExpiresAt)throw new KitchenError("Estimate expired. Calculate it again.");
 try{const result=await database().prepare("UPDATE kitchen_runs SET status='ready',updated_at=? WHERE id=? AND owner=? AND status='draft' AND lease IS NULL").bind(now(),id,user).run();if(result.meta.changes!==1)throw new KitchenError("This estimate has already started.");}catch(error){if(String(error).includes('UNIQUE'))throw new KitchenError("You already have an active order. Resume or cancel it first.");throw error;}
 return repository.load(id,user);
}
export async function updateBudget(user:string,id:string,value:unknown){
 const budgetMicros=parseBudget(value),row=await database().prepare('SELECT * FROM kitchen_runs WHERE id=? AND owner=?').bind(id,user).first<{state:string;[key:string]:unknown}>(),run=row?decodeRow(row):null;
 if(!run||!['ready','budget','completed','error'].includes(run.status)||run.leaseUntil||run.uncertain)throw new KitchenError("The budget can only be changed while an order is stopped.");
 if(!run.pricingDate||!run.rates)throw new KitchenError("Create a new estimate for this older order first.");assertPricingFresh(run.pricingDate);
 const funds=ledger(run);if(funds.unknown||funds.reserved)throw new KitchenError("Check the unknown spending with your provider first.");if(budgetMicros<funds.spent)throw new KitchenError("The budget cannot be lower than the amount already spent.");
 const previous=run.status;run.budgetMicros=budgetMicros;run.budgetStop=null;run.status=previous==='budget'?'ready':previous;delete run.actionQuote;
 try{const result=await database().prepare("UPDATE kitchen_runs SET state=?,status=?,updated_at=? WHERE id=? AND owner=? AND lease IS NULL AND status=? AND state=?").bind(JSON.stringify(run),run.status,now(),id,user,previous,row!.state).run();if(result.meta.changes!==1)throw new KitchenError("The order has changed. Refresh its state.");}catch(error){if(String(error).includes('UNIQUE'))throw new KitchenError("Finish or cancel the other active order first.");throw error;}
 return repository.load(id,user);
}
export async function controlRun(user:string,id:string,action:string){
 if(!['pause','resume','cancel'].includes(action))throw new KitchenError("Unknown action.");const run=await repository.load(id,user);if(!run)throw new KitchenError("Order not found.");
 if(run.uncertain&&action!=='cancel')throw new KitchenError("The previous request outcome is unknown. Automatic retries are disabled; cancel the order and check provider spending.");
 if(action==='cancel')await database().prepare("UPDATE kitchen_runs SET status='cancelled',paused=1,updated_at=? WHERE id=? AND owner=?").bind(now(),id,user).run();else await database().prepare("UPDATE kitchen_runs SET paused=?,updated_at=? WHERE id=? AND owner=? AND status IN ('ready','running')").bind(action==='pause'?1:0,now(),id,user).run();return repository.load(id,user);
}
export async function stepRun(user:string,id:string){
 const keys=await getKeys(user);
 return performStep(repository,id,user,async(args:{provider:Provider;model:string;system:string;prompt:string;maxOutput:number})=>{
  const req=prepareProviderRequest(args.provider,keys[args.provider],args.model,args.system,args.prompt,args.maxOutput);let response:Response;
  try{response=await fetch(req.url,{method:'POST',headers:req.headers as Record<string,string>,body:JSON.stringify(req.body),signal:AbortSignal.timeout(150000)});}catch{throw new KitchenError("The provider connection was interrupted. Cost is unknown; the request was not retried.");}
  if(!response.ok)throw new KitchenError(providerError(args.provider,response.status));let value;try{value=await response.json();}catch{throw new KitchenError("The provider returned an unreadable response. Cost is unknown; retries are disabled.");}return readProviderResult(args.provider,value);
 },(args:{provider:Provider;model:string;system:string;prompt:string;maxOutput:number})=>countInput(keys,args));
}
async function countInput(keys:Keys,args:{provider:Provider;model:string;system:string;prompt:string;maxOutput:number}){
  const req=prepareProviderRequest(args.provider,keys[args.provider],args.model,args.system,args.prompt,args.maxOutput);
  const url=args.provider==='openai'?'https://api.openai.com/v1/responses/input_tokens':'https://api.anthropic.com/v1/messages/count_tokens';
  const body=args.provider==='openai'?{model:args.model,instructions:args.system,input:args.prompt}:{model:args.model,system:args.system,messages:[{role:'user',content:args.prompt}]};
  let response;try{response=await fetch(url,{method:'POST',headers:req.headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw new KitchenError("Token counting is unavailable. No paid request was sent.");}
  if(!response.ok)throw new KitchenError("Could not count input tokens. No paid request was sent.");
  const value=await response.json() as {input_tokens?:number};if(!Number.isSafeInteger(value.input_tokens)||value.input_tokens!<0)throw new KitchenError("The provider did not return an input token count.");return value.input_tokens!;
}
export async function quoteAction(user:string,id:string,value:Record<string,unknown>){
 const row=await database().prepare('SELECT * FROM kitchen_runs WHERE id=? AND owner=?').bind(id,user).first<{state:string;[key:string]:unknown}>();if(!row)throw new KitchenError("Order not found.");
 if(value.feedback!==undefined&&typeof value.feedback!=='string')throw new KitchenError("Describe the revision in text.");
 const run=decodeRow(row),q=planAction(run,String(value.taskId),String(value.action),(value.feedback as string)||'');
 // The client never supplies prompts, model IDs, prices or a reservation amount.
 const input=buildTaskInput(run,q.task),tokens=await countInput(await getKeys(user),input),reserve=reserveCost(run.rates![q.task.provider+'/'+q.task.model],tokens,input.maxOutput);
 run.actionQuote={...q,id:crypto.randomUUID(),input,reserveMicros:reserve.micros,expiresAt:Date.now()+5*60000};
 const result=await database().prepare("UPDATE kitchen_runs SET state=?,updated_at=? WHERE id=? AND owner=? AND state=? AND status=? AND paused=? AND lease IS NULL").bind(JSON.stringify(run),now(),id,user,row.state,run.status,run.paused?1:0).run();
 if(result.meta.changes!==1)throw new KitchenError("The order changed during estimation. Refresh it and calculate again.");return repository.load(id,user);
}
export async function acceptAction(user:string,id:string,quoteId:unknown){
 const row=await database().prepare('SELECT * FROM kitchen_runs WHERE id=? AND owner=?').bind(id,user).first<{state:string;[key:string]:unknown}>();if(!row)throw new KitchenError("Order not found.");
 const current=decodeRow(row),run=applyAction(current,String(quoteId));
 try{const result=await database().prepare("UPDATE kitchen_runs SET state=?,status='ready',paused=0,updated_at=? WHERE id=? AND owner=? AND state=? AND status=? AND lease IS NULL").bind(JSON.stringify(run),now(),id,user,row.state,current.status).run();if(result.meta.changes!==1)throw new KitchenError("The action was already confirmed or the order changed.");}catch(error){if(String(error).includes('UNIQUE'))throw new KitchenError("Finish or cancel the other active order first.");throw error;}
 return repository.load(id,user);
}
export {textModel};


