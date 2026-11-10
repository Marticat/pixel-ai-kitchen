import test from 'node:test';
import assert from 'node:assert/strict';
import {RATES,PRICING_DATE,ledger} from '../lib/kitchen-money.mjs';
const flow=await import('../lib/kitchen-workflow.mjs').catch(()=>({}));
function fixture(){return {status:'completed',prompt:'UNRELATED GLOBAL HISTORY',budgetMicros:1000000,pricingDate:PRICING_DATE,maxOutput:2048,mode:'economy',catalogue:RATES.map(r=>({provider:r.provider,id:r.id})),rates:Object.fromEntries(RATES.map(r=>[r.provider+'/'+r.id,r])),tasks:[{id:'cart',role:"Cart",task:"Fix the cart",provider:'openai',model:'gpt-6-luna',dependsOn:[],status:'completed',output:'old cart',revision:0,usage:{input:20,output:30,total:50},cost:{state:'settled',micros:100}},{id:'page',role:"Page",task:"Page",provider:'openai',model:'gpt-6-luna',dependsOn:['cart'],status:'completed',output:'keep this',cost:{state:'settled',micros:200}},{id:'other',role:"Other",task:"Unrelated",provider:'openai',model:'gpt-6-luna',dependsOn:[],status:'completed',output:'PRIVATE UNRELATED OUTPUT'}]};}
test('Worker context excludes unrelated global prompt and other tasks',()=>{
 assert.equal(typeof flow.buildTaskInput,'function');const run=fixture(),built=flow.buildTaskInput(run,run.tasks[1]);
 assert.match(built.prompt,/old cart/);assert.doesNotMatch(built.prompt,/UNRELATED|PRIVATE/);assert.equal(built.context.sources.length,1);
});
test('Oversized dependency context is bounded and explicitly disclosed',()=>{
 assert.equal(typeof flow.buildTaskInput,'function');const run=fixture();run.tasks[0].output='cart detail '.repeat(5000);const built=flow.buildTaskInput(run,run.tasks[1]);
 assert.ok(built.context.includedChars<=12000);assert.ok(built.context.sources[0].trimmed);assert.match(built.prompt,/shortened/);
});
test('Revision retains spend and old text, preserving other results with stale marker',()=>{
 assert.equal(typeof flow.applyAction,'function');const run=fixture();const action=flow.planAction(run,'cart','repair',"Add a remove button");action.id='q';action.expiresAt=Date.now()+60000;action.reserveMicros=1000;run.actionQuote=action;
 const next=flow.applyAction(run,'q');assert.equal(next.tasks[0].attempts[0].output,'old cart');assert.equal(next.tasks[1].output,'keep this');assert.equal(next.tasks[1].stale,true);assert.equal(next.tasks[2].stale,undefined);assert.equal(ledger(next).spent,300);assert.equal(next.tasks[0].revision,1);assert.equal(next.pendingTaskId,'cart');assert.throws(()=>flow.applyAction(next,'q'));
});
test('Escalation requires a failed current review and selects a stronger priced model',()=>{
 assert.equal(typeof flow.planAction,'function');const run=fixture();assert.throws(()=>flow.planAction(run,'cart','escalate',''),/review/);
 run.tasks[0].review={passed:false,issues:["No remove button"],revision:0};const q=flow.planAction(run,'cart','escalate','');assert.equal(q.task.model,'gpt-6.1-terra');
 run.tasks[0].revision=1;assert.throws(()=>flow.planAction(run,'cart','escalate',''),/review/);
});
test('Unknown costs, exhausted revisions, cancelled orders and expired quotes cannot retry',()=>{
 assert.equal(typeof flow.planAction,'function');const run=fixture();run.tasks[0].revision=2;assert.throws(()=>flow.planAction(run,'cart','repair','again'),/two revisions/);
 run.tasks[0].revision=0;run.tasks[0].cost={state:'unknown',reservedMicros:100};assert.throws(()=>flow.planAction(run,'cart','repair','again'),/spending/);
 run.tasks[0].cost={state:'settled',micros:100};const q=flow.planAction(run,'cart','repair','again');q.id='q';q.expiresAt=Date.now()-100;run.actionQuote=q;assert.throws(()=>flow.applyAction(run,'q'),/expired|stale/);
 run.status='cancelled';assert.throws(()=>flow.planAction(run,'cart','repair','again'));
});
test('Review validates boolean verdict and bounded issues; no false pass on invalid JSON',()=>{
 assert.equal(typeof flow.parseReview,'function');assert.deepEqual(flow.parseReview('{"passed":false,"issues":["missing button"]}'),{passed:false,issues:['missing button']});
 assert.throws(()=>flow.parseReview('{"passed":"false","issues":[]}'));assert.throws(()=>flow.parseReview('{"passed":true,"issues":["bug"]}'));
});
test('Repairing a dependent task cannot hide stale inputs',()=>{
 const run=fixture();run.tasks[0].stale=true;const q=flow.planAction(run,'page','repair','Update page');assert.equal(q.task.stale,true);assert.match(flow.buildTaskInput(run,q.task).prompt,/expired|stale/);
});
test('An unsent budget-blocked action can be re-quoted without another revision',()=>{
 const run=fixture();let q=flow.planAction(run,'cart','repair','Delete button');q.id='first';q.reserveMicros=100;q.expiresAt=Date.now()+10000;q.input=flow.buildTaskInput(run,q.task);run.actionQuote=q;
 const pending=flow.applyAction(run,'first');pending.status='budget';
 const refresh=flow.planAction(pending,'cart','refresh');assert.equal(refresh.task.revision,1);assert.equal(refresh.task.attempts.length,1);refresh.id='new';refresh.expiresAt=Date.now()+10000;refresh.reserveMicros=300;refresh.input=flow.buildTaskInput(pending,refresh.task);pending.actionQuote=refresh;
 const accepted=flow.applyAction(pending,'new');assert.equal(accepted.tasks[0].revision,1);assert.equal(accepted.tasks[0].approvedReserveMicros,300);assert.equal(ledger(accepted).spent,300);
 pending.tasks[0].cost={state:'unknown',reservedMicros:100};assert.throws(()=>flow.planAction(pending,'cart','refresh'),/spending/);
});
