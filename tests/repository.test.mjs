import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../lib/kitchen-repo.mjs';
import {buildTaskInput} from '../lib/kitchen-workflow.mjs';
import {planAction,applyAction} from '../lib/kitchen-workflow.mjs';
const files=[{path:'src/App.tsx',sha:'a'.repeat(40),content:'export default 1;'}];
test('repository contracts are available',()=>assert.equal(typeof repo.parseChanges,'function'));
test('rejects secret paths, traversal, workflow and symlink edits',()=>{
 for(const path of ['../x','.env','.env.local','src/.env.production','.github/workflows/ci.yml','src/../x','src\\x','/x','package-lock.json','src/key.pem','credentials.json','src/secrets.json','service-account.json']) assert.equal(repo.allowedPath(path),false,path);
 assert.throws(()=>repo.validateFiles([{path:'src/x.ts',mode:'120000',size:20}]),/regular/);
});
test('only edits complete selected files, rejects duplicates, deletion and no-op',()=>{
 assert.deepEqual(repo.parseChanges(JSON.stringify({summary:'Fix',files:[{path:files[0].path,content:'export default 2;'}]}),files).files[0].before,files[0].content);
 for(const changes of [[{path:'other.ts',content:'x'}],[{path:files[0].path,content:null}],[{path:files[0].path,content:files[0].content}],[{path:files[0].path,content:'2'},{path:files[0].path,content:'3'}]]) assert.throws(()=>repo.parseChanges(JSON.stringify({summary:'Fix',files:changes}),files));
});
test('reuse is deterministic and isolated by owner, commit, brief and model',async()=>{
 const job={owner:'alice',repository:'a/b',baseSha:'a'.repeat(40),files,brief:'Fix cart',model:'m',provider:'openai',maxOutput:8192,version:1};
 const key=await repo.reuseKey(job);assert.equal(key,await repo.reuseKey({...job}));
 for(const change of [{owner:'bob'},{baseSha:'b'.repeat(40)},{brief:'Fix payment'},{model:'other'},{files:[{...files[0],content:'different'}]}])assert.notEqual(key,await repo.reuseKey({...job,...change}));
});
test('acceptance requires exact checked head, unchanged base and successful build',()=>{
 const job={baseSha:'a',headSha:'b',checks:{headSha:'b',status:'completed',conclusion:'success',build:'success',test:'skipped'}};
 assert.equal(repo.assertAcceptable(job,'a','b'),true);
 for(const [j,base,head] of [[job,'c','b'],[job,'a','c'],[{...job,checks:{...job.checks,headSha:'c'}},'a','b'],[{...job,checks:{...job.checks,build:'skipped'}},'a','b']])assert.throws(()=>repo.assertAcceptable(j,base,head));
});
test('repository worker receives exact selected sources and cumulative repair instructions',()=>{
 const task={id:'chef',kind:'work',provider:'openai',model:'m',dependsOn:[],feedback:'Build failed: src/App.tsx:2',attempts:[{output:'previous JSON'}]};
 const input=buildTaskInput({maxOutput:8192,repo:{brief:'Fix cart',files},tasks:[task]},task);
 assert.match(input.prompt,/src\/App.tsx/);assert.match(input.prompt,/previous JSON/);assert.match(input.system,/cumulative/);assert.match(input.system,/JSON only/);
});
test('package scripts cannot be changed to fake a passing verification',()=>{
 assert.throws(()=>repo.parseChanges(JSON.stringify({summary:'Cheat',files:[{path:'package.json',content:'{"scripts":{"test":"true"}}'}]}),[{path:'package.json',content:'{}'}]),/package/);
});
test('accepted repository orders cannot create or consume paid revision quotes',()=>{
 const run={repo:{accepted:true},status:'completed',tasks:[]};
 assert.throws(()=>planAction(run,'chef','repair','fix'),/accepted/);
 assert.throws(()=>applyAction(run,'quote'),/accepted/);
});
