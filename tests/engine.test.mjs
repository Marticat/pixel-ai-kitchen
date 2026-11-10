import test from 'node:test';
import assert from 'node:assert/strict';
import {performStep} from '../lib/kitchen-engine.mjs';

function fixture(){
let locked=false;
const run={id:'run',owner:'user',status:'ready',paused:false,maxOutput:2048,mode:'balance',prompt:'Подготовь проект',catalogue:[{provider:'openai',id:'gpt-6-luna'},{provider:'anthropic',id:'claude-haiku-5-5'}],tasks:[{id:'chef',role:'Шеф',task:'Составить план',provider:'openai',model:'gpt-6-luna',dependsOn:[],status:'queued',output:'',usage:null}]};
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
