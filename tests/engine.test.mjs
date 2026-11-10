import test from 'node:test';
import assert from 'node:assert/strict';
import {performStep as guardedStep} from '../lib/kitchen-engine.mjs';
import {rateFor,PRICING_DATE,PRICING_VERSION,ledger,reserveCost} from '../lib/kitchen-money.mjs';
const performStep=(...args)=>guardedStep(...args,async()=>100);

function fixture(){
let locked=false;
const run={id:'run',owner:'user',status:'ready',paused:false,maxOutput:2048,mode:'balance',prompt:'Подготовь проект',catalogue:[{provider:'openai',id:'gpt-6-luna'},{provider:'anthropic',id:'claude-haiku-5-5'}],tasks:[{id:'chef',role:'Шеф',task:'Составить план',provider:'openai',model:'gpt-6-luna',dependsOn:[],status:'queued',output:'',usage:null}]};
run.budgetMicros=1000000;run.pricingDate=PRICING_DATE;run.pricingVersion=PRICING_VERSION;run.rates=Object.fromEntries(run.catalogue.map(m=>[m.provider+'/'+m.id,rateFor(m.provider,m.id)]));
const store={load:async(id,user)=>id===run.id&&user===run.owner?structuredClone(run):null,acquire:async(id,user)=>{if(id!==run.id||user!==run.owner||locked||run.paused||run.status!=='ready')return null;locked=true;run.status='running';return 'lease';},save:async(id,user,lease,value,release)=>{assert.equal(lease,'lease');Object.assign(run,structuredClone(value));if(release)locked=false;return true;}};
return {run,store};
}
test('A simultaneous step cannot issue a duplicate payable request',async()=>{
const {store,run}=fixture();let calls=0,release;
const wait=new Promise(r=>release=r);
const invoke=async()=>{calls++;await wait;return {text:JSON.stringify({title:'План',tasks:[{id:'write',role:'Автор',task:'Подготовить ответ',provider:'anthropic',model:'claude-haiku-5-5',dependsOn:[]}]}),complete:true,model:'gpt-6-luna',usage:{input:10,output:20,total:30}};};
const first=performStep(store,'run','user',invoke);
await new Promise(r=>setImmediate(r));
await assert.rejects(performStep(store,'run','user',invoke),/выполняется|недоступен/);release();await first;assert.equal(calls,1);assert.equal(run.tasks.length,2);assert.equal(run.tasks[0].usage.total,30);
});
test('Malformed plan preserves real planning usage and stops without workers',async()=>{
const {store,run}=fixture();await performStep(store,'run','user',async()=>({text:'not json',complete:true,model:'gpt-6-luna',usage:{input:3,output:4,total:7}}));
assert.equal(run.status,'error');assert.equal(run.tasks.length,1);assert.equal(run.tasks[0].usage.total,7);assert.match(run.tasks[0].error,/JSON/);
});
test('A delayed lock acquisition uses fresh state and never repeats the chef',async()=>{
 const {store,run}=fixture();const acquire=store.acquire;let release,entered=false;const gate=new Promise(r=>release=r);
 store.acquire=async(...args)=>{if(!entered){entered=true;await gate;}return acquire(...args);};
 const calls=[];const invoke=async(args)=>{calls.push(args.model);return args.model==='gpt-6-luna'?{text:JSON.stringify({title:'Plan',tasks:[{id:'write',role:'Writer',task:'Write',provider:'anthropic',model:'claude-haiku-5-5',dependsOn:[]}]}),complete:true,usage:{input:10,output:20,total:30}}:{text:'Final',complete:true,usage:{input:5,output:6,total:11}};};
 const delayed=performStep(store,'run','user',invoke);await new Promise(r=>setImmediate(r));
 await performStep(store,'run','user',invoke);release();await delayed;
 assert.deepEqual(calls,['gpt-6-luna','claude-haiku-5-5']);assert.equal(run.tasks[0].usage.total,30);assert.equal(run.tasks[1].usage.total,11);assert.equal(run.status,'completed');
});
test('Failed request is not retried and usage is explicitly unknown',async()=>{
const {store,run}=fixture();let calls=0;await performStep(store,'run','user',async()=>{calls++;throw new Error('Провайдер недоступен.');});
assert.equal(run.status,'error');assert.equal(run.tasks[0].usage,null);assert.equal(run.tasks[0].status,'error');
await assert.rejects(performStep(store,'run','user',async()=>{calls++;}),/выполняется|недоступен/);assert.equal(calls,1);
});
test('Ownership and pause are checked before calling a provider',async()=>{
const {store,run}=fixture();let calls=0;const invoke=async()=>{calls++;};
await assert.rejects(performStep(store,'run','someone-else',invoke),/найден/);
run.paused=true;await assert.rejects(performStep(store,'run','user',invoke),/пауз/);assert.equal(calls,0);
});
test('Truncated output remains visible and stops dependent tasks',async()=>{
const {store,run}=fixture();await performStep(store,'run','user',async()=>({text:'partial',complete:false,model:'gpt-6-luna',usage:{input:2,output:100,total:102},stopReason:'max_output_tokens'}));
assert.equal(run.tasks[0].output,'partial');assert.equal(run.tasks[0].status,'incomplete');assert.equal(run.tasks[0].usage.total,102);assert.equal(run.status,'error');
});
test('insufficient budget stops before generation and leaves the task queued',async()=>{
 const {store,run}=fixture();run.budgetMicros=1;let calls=0;
 await performStep(store,'run','user',async()=>{calls++;});
 assert.equal(calls,0);assert.equal(run.status,'budget');assert.equal(run.tasks[0].status,'queued');assert.equal(ledger(run).spent,0);assert.match(run.budgetStop,/бюджет/i);
});
test('a legacy run without a budget cannot bypass protection',async()=>{
 const {store,run}=fixture();delete run.budgetMicros;let calls=0;
 await performStep(store,'run','user',async()=>{calls++;});assert.equal(calls,0);assert.equal(run.status,'budget');
});
test('reserve is durable before provider invocation and unknown charges stay held',async()=>{
 const {store,run}=fixture();let observed=0;
 await performStep(store,'run','user',async()=>{observed=ledger(run).reserved;assert.ok(observed>0);throw new Error('Connection lost');});
 assert.equal(run.tasks[0].cost.state,'unknown');assert.equal(ledger(run).reserved,observed);assert.equal(ledger(run).unknown,true);assert.equal(ledger(run).spent,0);
});
test('missing usage stops further work even when plan text is valid',async()=>{
 const {store,run}=fixture();await performStep(store,'run','user',async()=>({text:JSON.stringify({title:'Plan',tasks:[{id:'write',role:'Writer',task:'Write',provider:'anthropic',model:'claude-haiku-5-5',dependsOn:[]}]}),complete:true,usage:null}));
 assert.equal(run.status,'error');assert.equal(run.tasks[0].cost.state,'unknown');assert.equal(run.tasks.length,1);
});
test('preflight failure releases lock without holding any paid reserve',async()=>{
 const {store,run}=fixture();let calls=0;await guardedStep(store,'run','user',async()=>{calls++;},async()=>{throw new Error('Token counting unavailable');});
 assert.equal(calls,0);assert.equal(ledger(run).reserved,0);assert.equal(run.tasks[0].status,'queued');assert.equal(run.status,'budget');
});
test('remaining budget includes earlier actual costs and accepts equality',async()=>{
 const {store,run}=fixture();const reserve=reserveCost(run.rates['openai/gpt-6-luna'],100,2048).micros;
 run.tasks.push({id:'old',status:'completed',cost:{state:'settled',micros:500}});run.budgetMicros=reserve+500;
 let calls=0;await performStep(store,'run','user',async()=>{calls++;return {text:'partial',complete:false,usage:{input:100,output:1,cacheRead:0,cacheWrite:0}};});
 assert.equal(calls,1);assert.ok(ledger(run).spent>500);assert.equal(ledger(run).reserved,0);
});
test('expired prices and missing model rates cannot generate',async()=>{
 for(const variant of ['old','missing']){const {store,run}=fixture();if(variant==='old')run.pricingDate='2020-01-01';else run.rates={};let calls=0;await performStep(store,'run','user',async()=>{calls++;});assert.equal(calls,0);assert.equal(run.status,'budget');}
});
test('pause at the atomic reservation gate prevents generation and releases lock',async()=>{
 const {store,run}=fixture(),save=store.save;let calls=0;
 store.save=async(id,user,lease,value,release)=>{if(!release){run.paused=true;return false;}value.paused=true;return save(id,user,lease,value,release);};
 await performStep(store,'run','user',async()=>{calls++;});assert.equal(calls,0);assert.equal(run.tasks[0].status,'queued');assert.equal(ledger(run).reserved,0);assert.equal(run.status,'ready');
});
