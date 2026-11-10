import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsage, validatePlan, chooseModels, prepareProviderRequest, readProviderResult} from '../lib/kitchen-core.mjs';

test('OpenAI cached/reasoning tokens are subsets, never additional tokens',()=>{
assert.deepEqual(normalizeUsage('openai',{input_tokens:120,output_tokens:50,input_tokens_details:{cached_tokens:80},output_tokens_details:{reasoning_tokens:30}}),{input:120,output:50,total:170,cacheRead:80,cacheWrite:0,reasoning:30});
});
test('Anthropic cache inputs are added to ordinary input exactly once',()=>{
assert.deepEqual(normalizeUsage('anthropic',{input_tokens:20,output_tokens:7,cache_creation_input_tokens:100,cache_read_input_tokens:40}),{input:160,output:7,total:167,cacheRead:40,cacheWrite:100,reasoning:null});
});
test('Missing or invalid usage is unknown, not a fabricated zero',()=>{
assert.equal(normalizeUsage('openai',undefined),null);
assert.equal(normalizeUsage('anthropic',{input_tokens:1}),null);
assert.equal(normalizeUsage('openai',{input_tokens:-1,output_tokens:1}),null);
});
const catalogue=[{provider:'openai',id:'gpt-6-astra'},{provider:'openai',id:'gpt-6-luna'},{provider:'anthropic',id:'claude-sonnet-5-5'},{provider:'anthropic',id:'claude-haiku-5-5'}];
test('A small request may be answered by the chef without spawning workers',()=>{
 const plan=validatePlan({title:'Кнопка',result:'button code',tasks:[]},catalogue);
 assert.equal(plan.result,'button code');assert.deepEqual(plan.tasks,[]);
 assert.throws(()=>validatePlan({title:'X',result:'',tasks:[]},catalogue));
});
test('Routing chooses available models only, with economy and quality preferences',()=>{
assert.equal(chooseModels(catalogue,'economy').workers.find(x=>x.provider==='openai').id,'gpt-6-luna');
assert.equal(chooseModels(catalogue,'quality').chief.id,'gpt-6-astra');
assert.throws(()=>chooseModels([{provider:'openai',id:'gpt-image-2'}],'balance'),/модел/);
});
const good={title:'Магазин',tasks:[{id:'ui',role:'Интерфейс',task:'Подготовить каталог товаров',provider:'openai',model:'gpt-6-luna',dependsOn:[]},{id:'review',role:'Проверка',task:'Проверить и собрать результаты',provider:'anthropic',model:'claude-sonnet-5-5',dependsOn:['ui']}]};
test('Validates trusted provider/model choices and dependency order',()=>{
const plan=validatePlan(good,catalogue);assert.equal(plan.tasks.length,2);
assert.throws(()=>validatePlan({...good,tasks:[{...good.tasks[0],model:'made-up'}]},catalogue),/модел/);
assert.throws(()=>validatePlan({...good,tasks:[{...good.tasks[0],dependsOn:['ui']},good.tasks[1]]},catalogue),/зависим/);
assert.throws(()=>validatePlan({...good,tasks:[{...good.tasks[0],id:'review'},good.tasks[1]]},catalogue),/идентификатор/);
assert.throws(()=>validatePlan({...good,tasks:Array(7).fill(good.tasks[0])},catalogue),/задач/);
});
test('Provider request binds auth, model and limit to fixed first-party endpoints',()=>{
const a=prepareProviderRequest('openai','secret','gpt-6-luna','system','hello',2048);
assert.equal(a.url,'https://api.openai.com/v1/responses');assert.equal(a.body.max_output_tokens,2048);assert.equal(a.body.store,false);
const b=prepareProviderRequest('anthropic','secret','claude-haiku-5-5','system','hello',1024);
assert.equal(b.url,'https://api.anthropic.com/v1/messages');assert.equal(b.body.max_tokens,1024);assert.equal(b.headers['x-api-key'],'secret');
});
test('Preserves usage on truncated completions and rejects missing text',()=>{
const r=readProviderResult('openai',{model:'gpt-6-luna',status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'partial'}]}],usage:{input_tokens:10,output_tokens:20}});
assert.equal(r.complete,false);assert.equal(r.text,'partial');assert.equal(r.usage.total,30);
const a=readProviderResult('anthropic',{model:'claude-haiku-5-5',stop_reason:'end_turn',content:[{type:'text',text:'answer'}],usage:{input_tokens:10,output_tokens:2}});
assert.equal(a.complete,true);assert.equal(a.text,'answer');
assert.equal(readProviderResult('openai',{status:'completed',output:[],usage:{input_tokens:5,output_tokens:1}}).complete,false);
});
test('missing, negative or unexpected cache categories cannot be billed as zero',()=>{
 for(const provider of ['openai','anthropic']){const r=readProviderResult(provider,{usage:{input_tokens:10,output_tokens:2},output:[],content:[]});assert.equal(r.usage.billingComplete,false);}
 const a=readProviderResult('anthropic',{usage:{input_tokens:10,output_tokens:2,cache_read_input_tokens:-1,cache_creation_input_tokens:0},content:[]});assert.equal(a.usage.billingComplete,false);
 const b=readProviderResult('anthropic',{usage:{input_tokens:10,output_tokens:2,cache_read_input_tokens:0,cache_creation_input_tokens:100,cache_creation:{ephemeral_1h_input_tokens:100}},content:[]});assert.equal(b.usage.billingComplete,false);
});
