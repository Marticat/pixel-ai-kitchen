// Standard, global, direct API prices in USD per million tokens.
// Source snapshots checked 2026-11-10. Unknown model families are never inferred.
export const PRICING_DATE='2026-11-10';
export const PRICING_VERSION='2026-11-10-standard-v1';
export const PRICE_SOURCES={openai:'https://developers.openai.com/api/docs/pricing',anthropic:'https://platform.claude.com/docs/en/about-claude/pricing'};
export const RATES=[
 ['openai','gpt-6-astra',10,50,1,12.5,272000,2,1.5],
 ['openai','gpt-6.1-sol',2,10,.1,2.5,272000,2,1.5],
 ['openai','gpt-6.1-terra',1,5,.05,1.25,272000,2,1.5],
 ['openai','gpt-6-luna',.1,.5,.01,.125,272000,2,1.5],
 ['anthropic','claude-fable-5-2',8,40,.2,10,0,1,1],
 ['anthropic','claude-opus-5-5',4,20,.2,5,0,1,1],
 ['anthropic','claude-sonnet-5-5',2,10,.1,2.5,0,1,1],
 ['anthropic','claude-haiku-5-5',.1,.5,.01,.125,100000,5,5],
].map(([provider,id,input,output,cacheRead,cacheWrite,threshold,longInput,longOutput])=>({provider,id,input,output,cacheRead,cacheWrite,threshold,longInput,longOutput}));

export function rateFor(provider,id){
 if(typeof id!=='string')return null;
 const base=id.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8})$/,'');
 const rate=RATES.find(r=>r.provider===provider&&r.id===base);
 return rate?structuredClone(rate):null;
}
export function assertPricingFresh(date=PRICING_DATE,now=Date.now()){
 const age=now-Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(age)||age<0||age>7*86400000)throw new Error('Тарифы требуют обновления. Платные запросы остановлены до проверки цен.');
}
export function parseBudget(value){
 if(typeof value!=='string'||!/^\d{1,4}(?:\.\d{1,2})?$/.test(value))throw new Error('Введите бюджет в USD с точностью до цента.');
 const cents=Math.round(Number(value)*100);
 if(cents<1||cents>100000)throw new Error('Бюджет должен быть от $0.01 до $1000.00.');
 return cents*10000;
}
const valid=n=>Number.isSafeInteger(n)&&n>=0;
function effective(rate,input){const long=rate.threshold>0&&input>rate.threshold;return {input:long?rate.longInput:1,output:long?rate.longOutput:1};}
// Integer nano-USD arithmetic; round up only at the micro-USD ledger boundary.
function charge(tokens,price){return tokens*Math.round(price*1000);}
export function priceUsage(rate,usage){
 if(!rate||!usage||usage.billingComplete===false)return null;
 const {input,output}=usage,read=usage.cacheRead??0,write=usage.cacheWrite??0;
 if(![input,output,read,write].every(valid)||read+write>input)return null;
 const m=effective(rate,input),ordinary=charge(input-read-write,rate.input*m.input),cached=charge(read,rate.cacheRead*m.input),written=charge(write,rate.cacheWrite*m.input),out=charge(output,rate.output*m.output);
 const total=ordinary+cached+written+out;if(!Number.isSafeInteger(total))return null;
 return {input:Math.ceil((ordinary+cached+written)/1000),output:Math.ceil(out/1000),total:Math.ceil(total/1000)};
}
export function reserveCost(rate,inputTokens,maxOutput){
 if(!rate||!valid(inputTokens)||!valid(maxOutput))throw new Error('Невозможно рассчитать резерв для запроса.');
 const padded=Math.ceil(inputTokens*1.1)+512,m=effective(rate,padded);
 const micros=Math.ceil((charge(padded,Math.max(rate.input,rate.cacheWrite)*m.input)+charge(maxOutput,rate.output*m.output))/1000);
 if(!Number.isSafeInteger(micros))throw new Error('Слишком большой резерв запроса.');
 return {micros,inputTokens:padded};
}
export function ledger(run){
 let spent=0,reserved=0,unknown=false;
 for(const t of run.tasks){if(t.cost?.state==='settled')spent+=t.cost.micros;else if(t.cost?.state==='reserved'||t.cost?.state==='unknown'){reserved+=t.cost.reservedMicros;unknown ||= t.cost.state==='unknown';}}
 return {spent,reserved,unknown,remaining:Math.max(0,(run.budgetMicros??0)-spent-reserved)};
}
export function estimateOrder(prompt,maxOutput,selected){
 const chief=rateFor(selected.chief.provider,selected.chief.id),workers=selected.workers.map(m=>rateFor(m.provider,m.id));
 if(!chief||!workers.length||workers.some(r=>!r))throw new Error('Для выбранной модели нет проверенного тарифа.');
 // Informational scenario range, not a probability interval or a spending ceiling.
 const promptTokens=Math.ceil(new TextEncoder().encode(prompt).length/3);
 const chiefLow=priceUsage(chief,{input:promptTokens+700,output:Math.min(600,maxOutput),cacheRead:0,cacheWrite:0}).total;
 const chiefHigh=reserveCost(chief,promptTokens+1800,Math.min(4096,maxOutput)).micros;
 const workerLow=Math.min(...workers.map(r=>priceUsage(r,{input:promptTokens+700,output:Math.ceil(maxOutput*.35),cacheRead:0,cacheWrite:0}).total));
 const workerHigh=Math.max(...workers.map(r=>reserveCost(r,promptTokens+2000+4*maxOutput,maxOutput).micros));
 return {version:PRICING_VERSION,verifiedAt:PRICING_DATE,lowMicros:chiefLow+2*workerLow,highMicros:chiefHigh+5*workerHigh,rows:[{label:'Шеф · 1 запрос',models:[selected.chief.id],lowMicros:chiefLow,highMicros:chiefHigh},{label:'Команда · 2–5 запросов',models:selected.workers.map(m=>m.id),lowMicros:2*workerLow,highMicros:5*workerHigh}]};
}
