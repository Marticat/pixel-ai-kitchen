import test from 'node:test';
import assert from 'node:assert/strict';
const errors=await import('../lib/kitchen-errors.mjs').catch(()=>({}));
test('English user-facing errors survive sanitization while internal errors stay private',()=>{
 assert.equal(typeof errors.KitchenError,'function');
 assert.equal(errors.publicErrorMessage(new errors.KitchenError('Insufficient budget.')),'Insufficient budget.');
 assert.equal(errors.publicErrorMessage(new Error('database password=secret')),'Service temporarily unavailable. Please try again later.');
 assert.equal(new errors.KitchenError('Sign in with ChatGPT.',401).status,401);
});
