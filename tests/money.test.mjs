import test from 'node:test';
import assert from 'node:assert/strict';
import {rateFor,priceUsage,reserveCost,parseBudget,estimateOrder,assertPricingFresh,PRICING_VERSION} from '../lib/kitchen-money.mjs';

test('USD budgets require finite cents, bounded values, no exponent or coercion',()=>{
 assert.equal(parseBudget('2.50'),2500000);assert.equal(parseBudget('0.01'),10000);
 for(const value of ['0','-1','NaN','Infinity','1e3','2.001',{},null,'1001'])assert.throws(()=>parseBudget(value));
});
test('price normal input, cache read/write, output exactly once in micro-USD',()=>{
 const rate=rateFor('openai','gpt-6.1-sol');
 assert.equal(priceUsage(rate,{input:1000,output:200,cacheRead:300,cacheWrite:100}).total,3480);
 assert.equal(priceUsage(rate,{input:1000,output:200,cacheRead:300,cacheWrite:100}).input,1480);
 assert.equal(priceUsage(rate,{input:100,output:1,cacheRead:101,cacheWrite:0}),null);
 assert.equal(priceUsage(rate,null),null);
 assert.equal(priceUsage(rate,{input:1,output:1,billingComplete:false}),null);
});
test('unknown model cannot borrow a similar model price',()=>{
 assert.equal(rateFor('openai','gpt-6-astra-pro'),null);
 assert.equal(rateFor('openai','gpt-6-luna-2026-10-01').id,'gpt-6-luna');
 assert.equal(rateFor('anthropic','claude-fable-5-2-experimental'),null);
});
test('reserving the full answer and worst-case cache writes bounds known spend',()=>{
 const rate=rateFor('openai','gpt-6.1-sol');const reserve=reserveCost(rate,1000,2048);
 assert.equal(reserve.inputTokens,1612);assert.equal(reserve.micros,24510);
 assert.ok(reserve.micros>=priceUsage(rate,{input:1000,output:2048,cacheRead:0,cacheWrite:1000}).total);
});
test('long context tiers and fractional cheap tokens are never rounded down',()=>{
 const rate=rateFor('anthropic','claude-haiku-5-5');
 assert.equal(priceUsage(rate,{input:100000,output:0,cacheRead:0,cacheWrite:0}).total,10000);
 assert.equal(priceUsage(rate,{input:100001,output:0,cacheRead:0,cacheWrite:0}).total,50001);
 assert.equal(priceUsage(rate,{input:1,output:0,cacheRead:0,cacheWrite:0}).total,1);
});
test('draft estimate has a chef, optional workers and no unknown prices',()=>{
 const selected={chief:{provider:'openai',id:'gpt-6.1-sol'},workers:[{provider:'anthropic',id:'claude-haiku-5-5'}]};
 const e=estimateOrder("Build a store",2048,selected);
 assert.equal(e.rows.length,2);assert.ok(e.lowMicros>0&&e.highMicros>=e.lowMicros);assert.equal(e.version,PRICING_VERSION);
 assert.throws(()=>estimateOrder('x',2048,{...selected,chief:{provider:'openai',id:'unknown'}}));
});
test('expired tariffs refuse new paid work',()=>{
 assert.doesNotThrow(()=>assertPricingFresh('2026-11-10',Date.parse('2026-11-11T00:00:00Z')));
 assert.throws(()=>assertPricingFresh('2026-11-10',Date.parse('2026-11-18T00:00:00Z')));
});
