import {KitchenError} from './kitchen-errors.mjs';
import {allowedPath,validateFiles,assertAcceptable} from './kitchen-repo.mjs';
import {WORKFLOW,WORKFLOW_PATH,matchesRun,extractArtifact} from './kitchen-checks.mjs';
const enc=encodeURIComponent;
export function repoPath(name){if(typeof name!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(name)||name.split('/').some(p=>p==='.'||p==='..'))throw new KitchenError('Select a valid owner/repository.');return '/repos/'+name;}
const safeSha=sha=>{if(!/^[a-f0-9]{40}$/.test(sha))throw new KitchenError('Invalid repository version.');return sha;};
export class GitHub{
 constructor(token,transport=fetch){if(!token)throw new KitchenError('Connect GitHub in Connections first.');this.token=token;this.transport=transport;}
 async request(path,method='GET',body=undefined){
  if(!/^\/(user(?:\?|\/|$)|repos\/)/.test(path)||path.includes('..')||path.includes('\\'))throw new KitchenError('Invalid GitHub request.');
  let response;try{response=await this.transport('https://api.github.com'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+this.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Pixel-AI-Kitchen','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});}catch{throw new KitchenError('GitHub did not confirm the operation. Refresh its state before retrying.');}
  if(!response.ok)throw new KitchenError(response.status===404?'GitHub resource not found or access is missing.':response.status===401||response.status===403?'GitHub access denied. Check token expiry, selected repositories, permissions and rate limits.':response.status===409||response.status===422?'GitHub rejected a conflicting change. Refresh the repository; branch protections may require review.':`GitHub request failed (${response.status}).`,response.status);
  return response.status===204?null:response.json();
 }
 async list(page=1){if(!Number.isInteger(page)||page<1||page>100)throw new KitchenError('Invalid repository page.');const list=await this.request('/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member&page='+page);return list.filter(r=>!r.archived&&r.permissions?.push).map(r=>({name:r.full_name,branch:r.default_branch,private:r.private}));}
 async head(name,branch){return (await this.request(repoPath(name)+'/git/ref/heads/'+enc(branch))).object.sha;}
 async file(name,path,sha){const data=await this.request(repoPath(name)+'/contents/'+path.split('/').map(enc).join('/')+'?ref='+safeSha(sha));if(data.type!=='file'||data.encoding!=='base64'||data.size>80000)throw new KitchenError('Unsupported source file.');const bytes=Uint8Array.from(atob(data.content.replace(/\s/g,'')),c=>c.charCodeAt(0));const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw new KitchenError('Binary source files are unsupported.');return text;}
 async snapshot(name,paths=[]){
  const metadata=await this.request(repoPath(name));if(metadata.archived||!metadata.permissions?.push)throw new KitchenError('This repository is not writable.');
  const baseBranch=metadata.default_branch,baseSha=await this.head(name,baseBranch),commit=await this.request(repoPath(name)+'/git/commits/'+safeSha(baseSha));
  const tree=await this.request(repoPath(name)+'/git/trees/'+commit.tree.sha+'?recursive=1');if(tree.truncated||tree.tree.length>3000)throw new KitchenError('This repository is too large for the first release.');
  const pkg=JSON.parse(await this.file(name,'package.json',baseSha));if(!pkg.scripts?.build||!pkg.devDependencies?.vite&&!pkg.dependencies?.vite||!pkg.dependencies?.react&&!pkg.devDependencies?.react||!tree.tree.some(f=>f.path==='package-lock.json')||!tree.tree.some(f=>f.path==='index.html'))throw new KitchenError('Select a root-level React/Vite npm project with index.html, package-lock.json and a build script.');
  const available=tree.tree.filter(f=>f.type==='blob'&&['100644','100755'].includes(f.mode)&&allowedPath(f.path)&&f.size<=30000).map(f=>({path:f.path,sha:f.sha,size:f.size,mode:f.mode}));
  let ready=false;try{ready=(await this.file(name,WORKFLOW_PATH,baseSha))===WORKFLOW;}catch{}
  const selected=paths.map(path=>{const f=available.find(f=>f.path===path);if(!f)throw new KitchenError('A selected source file changed or is unsupported.');return f;});
  const files=selected.length?await Promise.all(validateFiles(selected).map(async f=>({...f,content:await this.file(name,f.path,baseSha)}))):[];
  const otherWorkflows=tree.tree.filter(f=>/^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.path)&&f.path!==WORKFLOW_PATH).map(f=>f.path);
  return {repository:name,baseBranch,baseSha,baseTree:commit.tree.sha,available,files,workflowReady:ready,hasTests:Boolean(pkg.scripts.test),otherWorkflows};
 }
 async setup(name,reviewed){
  const base=reviewed.baseBranch,sha=safeSha(reviewed.baseSha);if(await this.head(name,base)!==sha)throw new KitchenError('The repository changed after workflow review. Reload and review it again.');
  const branch='kitchen-setup/'+crypto.randomUUID();
  await this.request(repoPath(name)+'/git/refs','POST',{ref:'refs/heads/'+branch,sha});
  let existing;try{existing=await this.request(repoPath(name)+'/contents/'+WORKFLOW_PATH+'?ref='+sha);}catch(e){if(e.status!==404)throw e;}
  await this.request(repoPath(name)+'/contents/'+WORKFLOW_PATH,'PUT',{message:'Configure Pixel Kitchen build and test checks',branch,content:btoa(WORKFLOW),...(existing?.sha?{sha:existing.sha}:{})});
  if(await this.head(name,base)!==sha)throw new KitchenError('The base changed during setup. The setup branch was saved; review it on GitHub before continuing.');
  const pr=await this.request(repoPath(name)+'/pulls','POST',{title:'Set up Pixel Kitchen checks',head:branch,base,body:'Adds the fixed Pixel Kitchen workflow. It runs npm install, build and available tests on kitchen/* branches, then uploads a private preview/report artifact. Review before merging. No model API keys are sent to GitHub. GitHub Actions usage is billed to this repository owner.'});return {url:pr.html_url};
 }
 async publish(job,changes,onPrepared=async(sha)=>{}){
  if(job.otherWorkflows?.length&&!job.otherWorkflowsApproved)throw new KitchenError('Review and approve the other workflows before publishing.');
  if(await this.head(job.repository,job.baseBranch)!==job.baseSha)throw new KitchenError('The base branch changed. Start a new order.');
  if(await this.file(job.repository,WORKFLOW_PATH,job.baseSha)!==WORKFLOW)throw new KitchenError('Install the current Kitchen workflow before running checks.');
  const parent=job.headSha||job.baseSha;if(job.headSha&&await this.head(job.repository,job.branch)!==job.headSha)throw new KitchenError('The kitchen branch changed outside this order.');
  const tree=await this.request(repoPath(job.repository)+'/git/trees','POST',{base_tree:job.baseTree,tree:changes.files.map(f=>({path:f.path,mode:job.files.find(x=>x.path===f.path)?.mode||'100644',type:'blob',content:f.content}))});
  const commit=await this.request(repoPath(job.repository)+'/git/commits','POST',{message:'Pixel Kitchen: '+changes.summary.slice(0,100),tree:tree.sha,parents:[parent]});
  await onPrepared(commit.sha);
  if(job.headSha)await this.request(repoPath(job.repository)+'/git/refs/heads/'+enc(job.branch),'PATCH',{sha:commit.sha,force:false});else await this.request(repoPath(job.repository)+'/git/refs','POST',{ref:'refs/heads/'+job.branch,sha:commit.sha});
  return commit.sha;
 }
 async reconcilePublish(job){
  const sha=safeSha(job.pendingHead);
  if(await this.head(job.repository,job.baseBranch)!==job.baseSha)throw new KitchenError('The base branch changed. Do not retry this publication.');
  let head;try{head=await this.head(job.repository,job.branch);}catch(e){if(e.status!==404)throw e;}
  if(head===sha)return sha;
  if(head&&head!==job.headSha)throw new KitchenError('The kitchen branch was changed elsewhere.');
  if(head)await this.request(repoPath(job.repository)+'/git/refs/heads/'+enc(job.branch),'PATCH',{sha,force:false});
  else await this.request(repoPath(job.repository)+'/git/refs','POST',{ref:'refs/heads/'+job.branch,sha});
  return sha;
 }
 async checks(job){
  if(!job.headSha)throw new KitchenError('Publish changes before checking Actions.');
  const runs=await this.request(repoPath(job.repository)+'/actions/workflows/'+enc('pixel-kitchen.yml')+'/runs?branch='+enc(job.branch)+'&head_sha='+job.headSha+'&event=push&per_page=100');
  const run=runs.workflow_runs.filter(r=>matchesRun(job,r)).sort((a,b)=>b.id-a.id)[0];if(!run)return {headSha:job.headSha,status:'queued',conclusion:null};
  const jobs=await this.request(repoPath(job.repository)+'/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100');const verify=jobs.jobs.find(j=>j.name==='Kitchen build and tests');
  const step=name=>verify?.steps?.find(s=>s.name===name)?.conclusion||'pending';
  const elapsedSeconds=jobs.jobs.reduce((n,j)=>n+(j.started_at&&j.completed_at?Math.max(0,(Date.parse(j.completed_at)-Date.parse(j.started_at))/1000):0),0);
  return {id:run.id,attempt:run.run_attempt||1,headSha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url,build:step('Build'),test:job.hasTests?step('Test'):'skipped',preview:step('Prepare preview'),elapsedSeconds};
 }
 async report(job){
  const checks=await this.checks(job);if(checks.status!=='completed')throw new KitchenError('Wait for Actions to finish.');
  const list=await this.request(repoPath(job.repository)+'/actions/runs/'+checks.id+'/artifacts?per_page=100');const artifact=list.artifacts.find(a=>a.name==='kitchen-report'&&!a.expired&&(!a.workflow_run||a.workflow_run.head_sha===job.headSha));if(!artifact||artifact.size_in_bytes>5*1024*1024)throw new KitchenError('The report is missing, expired or too large. Open the Actions logs on GitHub.');
  // Never forward the GitHub token to artifact storage redirects.
  const response=await this.transport('https://api.github.com'+repoPath(job.repository)+'/actions/artifacts/'+artifact.id+'/zip',{redirect:'manual',headers:{Authorization:'Bearer '+this.token,'User-Agent':'Pixel-AI-Kitchen',Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(25000)});
  const location=response.headers.get('location');if(response.status!==302||!location)throw new KitchenError('Could not download the Actions report.');const url=new URL(location);if(url.protocol!=='https:'||!(/(^|\.)blob\.core\.windows\.net$|(^|\.)actions\.githubusercontent\.com$/.test(url.hostname)))throw new KitchenError('Unexpected report storage location.');
  const download=await this.transport(url.toString(),{redirect:'error',signal:AbortSignal.timeout(25000)});if(!download.ok||Number(download.headers.get('content-length'))>5*1024*1024)throw new KitchenError('Could not read the Actions report.');
  const reader=download.body.getReader(),chunks=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();throw new KitchenError('Report exceeds 5 MB.');}chunks.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return {checks,files:extractArtifact(bytes)};
 }
 async accept(job){
  const checks=await this.checks(job);assertAcceptable({...job,checks},await this.head(job.repository,job.baseBranch),await this.head(job.repository,job.branch));
  if(await this.file(job.repository,WORKFLOW_PATH,job.headSha)!==WORKFLOW)throw new KitchenError('Verification workflow changed.');
  // Fast-forward only: a concurrent new base commit cannot be silently overwritten.
  await this.request(repoPath(job.repository)+'/git/refs/heads/'+enc(job.baseBranch),'PATCH',{sha:job.headSha,force:false});return {accepted:true,checks};
 }
}
