import {env} from 'cloudflare:workers';
import type {Model,Provider,Run} from './kitchen-types';
import {chooseModels,prepareProviderRequest,readProviderResult,textModel} from './kitchen-core.mjs';
import {performStep} from './kitchen-engine.mjs';

type Secrets={OPENAI_API_KEY?:string;ANTHROPIC_API_KEY?:string;KITCHEN_VAULT_KEY?:string;DB?:D1Database};
type Keys={openai?:string;anthropic?:string};
const runtime=()=>env as unknown as Secrets;
const database=()=>{const db=runtime().DB;if(!db)throw new Error('Хранилище заказов ещё не настроено.');return db;};
const now=()=>new Date().toISOString();
export function identity(request:Request){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)throw new Error('Войдите через ChatGPT, чтобы открыть свою кухню.');
 if(request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('Запрос с другого сайта отклонён.');if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('Ожидается JSON-запрос.');}
 return user;
}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
function unb64(text:string){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function vaultKey(){const secret=runtime().KITCHEN_VAULT_KEY;if(!secret)throw new Error('Защищённое хранилище ключей ещё не настроено.');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function getKeys(user:string):Promise<Keys>{
 const base:Keys={openai:runtime().OPENAI_API_KEY,anthropic:runtime().ANTHROPIC_API_KEY};
 const row=await database().prepare('SELECT ciphertext,iv FROM kitchen_keys WHERE owner=?').bind(user).first<{ciphertext:string;iv:string}>();if(!row)return base;
 try{const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:new TextEncoder().encode(user)},await vaultKey(),unb64(row.ciphertext));return {...base,...JSON.parse(new TextDecoder().decode(clear))};}catch{throw new Error('Не удалось открыть сохранённые ключи. Обновите подключение в настройках.');}
}
async function saveKeys(user:string,keys:Keys){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(user)},await vaultKey(),new TextEncoder().encode(JSON.stringify(keys)));await database().prepare('INSERT INTO kitchen_keys(owner,ciphertext,iv,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_at=excluded.updated_at').bind(user,b64(new Uint8Array(ciphertext)),b64(iv),now()).run();}
function providerError(provider:Provider,status:number){const name=provider==='openai'?'OpenAI':'Anthropic';return status===401||status===403?`${name}: ключ не принят или нет доступа к модели.`:status===429?`${name}: исчерпан лимит или баланс. Повтор автоматически не выполнялся.`:`${name}: ошибка сервиса (${status}). Повтор автоматически не выполнялся.`;}
async function providerModels(provider:Provider,key:string):Promise<Model[]>{
 const models:Model[]=[];let after='';
 for(let page=0;page<20;page++){
  const url=provider==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):'');
  const headers:Record<string,string>=provider==='openai'?{Authorization:`Bearer ${key}`}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(providerError(provider,response.status));
  const result=await response.json() as {data?:{id:string;display_name?:string;lifecycle?:string}[];has_more?:boolean;last_id?:string};if(!Array.isArray(result.data))throw new Error(`${provider}: некорректный каталог моделей.`);
  models.push(...result.data.filter(m=>typeof m.id==='string').map(m=>({provider,id:m.id,name:m.display_name||m.id,lifecycle:m.lifecycle})));
  if(provider==='openai'||!result.has_more)break;if(!result.last_id||result.last_id===after)throw new Error('Каталог моделей вернул некорректную страницу.');after=result.last_id;if(page===19)throw new Error('Каталог слишком большой. Не удалось загрузить все страницы.');
 }
 return models;
}
export async function getSettings(user:string,withModels=true){const keys=await getKeys(user);const models:Model[]=[];const errors:Partial<Record<Provider,string>>={};if(withModels)await Promise.all((['openai','anthropic'] as const).map(async provider=>{if(!keys[provider])return;try{models.push(...await providerModels(provider,keys[provider]!));}catch(error){errors[provider]=error instanceof Error&&error.message.includes(':')?error.message:'Не удалось проверить подключение. Попробуйте ещё раз.';}}));return {openai:Boolean(keys.openai),anthropic:Boolean(keys.anthropic),vaultReady:Boolean(runtime().KITCHEN_VAULT_KEY),models,errors};}
export async function updateSettings(user:string,value:Record<string,unknown>){
 const keys=await getKeys(user);let changed=false;
 for(const provider of ['openai','anthropic'] as const){if(typeof value[provider]==='string'&&value[provider]){const key=(value[provider] as string).trim();if(key.length<20||key.length>512||/\s/.test(key))throw new Error('Проверьте формат API-ключа.');await providerModels(provider,key);keys[provider]=key;changed=true;}}
 if(!changed)throw new Error('Введите хотя бы один новый API-ключ.');await saveKeys(user,keys);return getSettings(user);
}
function decodeRow(row:any):Run{return {...JSON.parse(row.state),status:row.status,paused:Boolean(row.paused),leaseUntil:row.lease_until,uncertain:Boolean(row.lease&&row.lease_until<Date.now())};}
const repository={
 async load(id:string,user:string){const row=await database().prepare('SELECT * FROM kitchen_runs WHERE id=? AND owner=?').bind(id,user).first();return row?decodeRow(row):null;},
 async acquire(id:string,user:string){const lease=crypto.randomUUID();const result=await database().prepare("UPDATE kitchen_runs SET lease=?,lease_until=?,status='running',updated_at=? WHERE id=? AND owner=? AND lease IS NULL AND status='ready' AND paused=0").bind(lease,Date.now()+180000,now(),id,user).run();return result.meta.changes===1?lease:null;},
 async save(id:string,user:string,lease:string,run:Run,release:boolean){const sql=release?"UPDATE kitchen_runs SET state=?,title=?,status=CASE WHEN status='cancelled' THEN 'cancelled' ELSE ? END,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND owner=? AND lease=?":"UPDATE kitchen_runs SET state=?,title=?,updated_at=? WHERE id=? AND owner=? AND lease=?";const args=release?[JSON.stringify(run),run.title,run.status,now(),id,user,lease]:[JSON.stringify(run),run.title,now(),id,user,lease];const result=await database().prepare(sql).bind(...args).run();if(result.meta.changes!==1)throw new Error('Результат не удалось сохранить: состояние заказа изменилось.');return true;}
};
export async function listRuns(user:string){const rows=await database().prepare('SELECT id,title,status,paused,created_at FROM kitchen_runs WHERE owner=? ORDER BY created_at DESC LIMIT 30').bind(user).all();return rows.results;}
export async function loadRun(user:string,id:string){return repository.load(id,user);}
export async function createRun(user:string,value:Record<string,unknown>){
 if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>8000)throw new Error('Опишите проект: от 1 до 8000 символов.');
 const mode=value.mode;if(mode!=='economy'&&mode!=='balance'&&mode!=='quality')throw new Error('Выберите режим работы.');const maxOutput=Number(value.maxOutput);if(![1024,2048,4096,8192].includes(maxOutput))throw new Error('Выберите лимит ответа.');
 const settings=await getSettings(user);if(!settings.openai||!settings.anthropic||Object.keys(settings.errors).length)throw new Error('Сначала подключите и проверьте оба провайдера в настройках.');
 const selected=chooseModels(settings.models,mode);
 const run:Run={id:crypto.randomUUID(),owner:user,title:'Новый проект',prompt:value.prompt.trim(),mode,maxOutput,status:'ready',paused:false,createdAt:now(),catalogue:selected.workers as Model[],tasks:[{id:'chef',role:'Шеф',task:'Разобрать запрос и распределить работу между моделями.',provider:selected.chief.provider,model:selected.chief.id,dependsOn:[],status:'queued',output:'',usage:null}]};
 try{await database().prepare('INSERT INTO kitchen_runs(id,owner,title,status,paused,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(run.id,user,run.title,run.status,0,JSON.stringify(run),run.createdAt,now()).run();}catch{throw new Error('У вас уже есть незавершённый заказ. Продолжите или отмените его в истории.');}return run;
}
export async function controlRun(user:string,id:string,action:string){
 if(!['pause','resume','cancel'].includes(action))throw new Error('Неизвестное действие.');const run=await repository.load(id,user);if(!run)throw new Error('Заказ не найден.');
 if(run.uncertain&&action!=='cancel')throw new Error('Исход предыдущего запроса неизвестен. Автоповтор отключён; отмените заказ и проверьте расход у провайдера.');
 if(action==='cancel')await database().prepare("UPDATE kitchen_runs SET status='cancelled',paused=1,updated_at=? WHERE id=? AND owner=?").bind(now(),id,user).run();else await database().prepare("UPDATE kitchen_runs SET paused=?,updated_at=? WHERE id=? AND owner=? AND status IN ('ready','running')").bind(action==='pause'?1:0,now(),id,user).run();return repository.load(id,user);
}
export async function stepRun(user:string,id:string){
 const keys=await getKeys(user);
 return performStep(repository,id,user,async(args:{provider:Provider;model:string;system:string;prompt:string;maxOutput:number})=>{
  const req=prepareProviderRequest(args.provider,keys[args.provider],args.model,args.system,args.prompt,args.maxOutput);let response:Response;
  try{response=await fetch(req.url,{method:'POST',headers:req.headers as Record<string,string>,body:JSON.stringify(req.body),signal:AbortSignal.timeout(150000)});}catch{throw new Error('Соединение с провайдером прервано. Расход неизвестен; запрос не повторён.');}
  if(!response.ok)throw new Error(providerError(args.provider,response.status));let value;try{value=await response.json();}catch{throw new Error('Провайдер вернул нечитаемый ответ. Расход неизвестен; повтор отключён.');}return readProviderResult(args.provider,value);
 });
}
export {textModel};

