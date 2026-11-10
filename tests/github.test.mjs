import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../lib/kitchen-github.mjs';
import * as checks from '../lib/kitchen-checks.mjs';
test('GitHub adapter is available',()=>assert.equal(typeof mod.GitHub,'function'));
test('GitHub errors never reflect token or upstream body and redirects are blocked',async()=>{
 const gh=new mod.GitHub('secret',async(url,options)=>{assert.equal(new URL(url).hostname,'api.github.com');assert.equal(options.redirect,'error');return new Response('secret upstream',{status:403});});
 await assert.rejects(gh.request('/user'),e=>!e.message.includes('secret')&&e.message.includes('GitHub'));
 await assert.rejects(gh.request('https://evil.test/user'));
});
test('workflow uses readonly permissions and fixed commands without model credentials',()=>{
 const y=checks.WORKFLOW;assert.match(y,/contents: read/);assert.match(y,/persist-credentials: false/);assert.match(y,/timeout-minutes: 10/);assert.match(y,/npm ci --ignore-scripts/);assert.doesNotMatch(y,/secrets\.|OPENAI_API_KEY|ANTHROPIC_API_KEY|pull_request_target/);
});
test('only fixed workflow, exact commit and branch may count as checks',()=>{
 const job={branch:'kitchen/abc',headSha:'a'.repeat(40)};
 const run={head_sha:job.headSha,head_branch:job.branch,event:'push',path:checks.WORKFLOW_PATH};
 assert.equal(checks.matchesRun(job,run),true);
 for(const change of [{head_sha:'b'.repeat(40)},{head_branch:'main'},{path:'.github/workflows/other.yml'},{event:'pull_request'}])assert.equal(checks.matchesRun(job,{...run,...change}),false);
});
test('invalid and oversized artifacts are rejected',()=>{
 assert.throws(()=>checks.extractArtifact(new Uint8Array([1,2,3])));
 assert.throws(()=>checks.extractArtifact(new Uint8Array(6*1024*1024)));
});
test('publish creates a cumulative tree and records pending SHA before updating branch',async()=>{
 const base='a'.repeat(40),head='b'.repeat(40),tree='c'.repeat(40),events=[];
 const job={repository:'a/b',baseBranch:'main',baseSha:base,baseTree:tree,branch:'kitchen/order',files:[{path:'src/App.tsx',mode:'100644'}]};
 const gh=new mod.GitHub('t',async(url,o)=>{
  const path=new URL(url).pathname,body=o.body&&JSON.parse(o.body);events.push([path,body]);
  if(path.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:base}});
  if(path.includes('/contents/'))return Response.json({type:'file',encoding:'base64',size:checks.WORKFLOW.length,content:Buffer.from(checks.WORKFLOW).toString('base64')});
  if(path.endsWith('/git/trees')){assert.equal(body.base_tree,tree);return Response.json({sha:tree});}
  if(path.endsWith('/git/commits')){assert.deepEqual(body.parents,[base]);return Response.json({sha:head});}
  if(path.endsWith('/git/refs')){assert.equal(events.at(-2)[0],'pending');assert.equal(body.ref,'refs/heads/kitchen/order');return Response.json({object:{sha:head}});}
  throw Error(path);
 });
 assert.equal(await gh.publish(job,{summary:'Fix',files:[{path:'src/App.tsx',content:'new'}]},async sha=>events.push(['pending',sha])),head);
});
test('accept never mutates a moved base or an untested proposal',async()=>{
 const job={repository:'a/b',baseBranch:'main',baseSha:'a'.repeat(40),headSha:'b'.repeat(40),branch:'kitchen/order'};let writes=0;
 const gh=new mod.GitHub('t',async(url,o)=>{if(o.method!=='GET')writes++;const path=new URL(url).pathname;if(path.includes('/runs'))return Response.json({workflow_runs:[{id:1,path:checks.WORKFLOW_PATH,event:'push',head_branch:job.branch,head_sha:job.headSha,status:'completed',conclusion:'success'}]});if(path.includes('/jobs'))return Response.json({jobs:[{name:'Kitchen build and tests',steps:[{name:'Build',conclusion:'success'},{name:'Test',conclusion:'success'}]}]});return Response.json({object:{sha:'c'.repeat(40)}});});
 // Narrow mock ensures only the acceptance boundary is exercised.
 gh.checks=async()=>({headSha:job.headSha,status:'completed',conclusion:'success',build:'success',test:'success'});
 await assert.rejects(gh.accept(job),/base branch changed/);assert.equal(writes,0);
});
test('publish refuses undisclosed foreign workflows',async()=>{
 const gh=new mod.GitHub('t',async()=>{throw Error('must not call');});
 await assert.rejects(gh.publish({otherWorkflows:['.github/workflows/deploy.yml']},{files:[]}),/other workflows/);
});
test('prepared publication retries the same commit when the branch does not exist',async()=>{
 const sha='b'.repeat(40),job={repository:'a/b',branch:'kitchen/one',baseBranch:'main',baseSha:'a'.repeat(40),pendingHead:sha};let writes=[];
 const gh=new mod.GitHub('t',async(url,o)=>{
  if(o.method==='POST'){writes.push(JSON.parse(o.body));return Response.json({object:{sha}});}
  if(new URL(url).pathname.endsWith('/main'))return Response.json({object:{sha:job.baseSha}});
  return new Response('',{status:404});
 });
 assert.equal(await gh.reconcilePublish(job),sha);assert.deepEqual(writes,[{ref:'refs/heads/kitchen/one',sha}]);
});
