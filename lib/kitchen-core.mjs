import {KitchenError,publicErrorMessage} from './kitchen-errors.mjs';
const n = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function normalizeUsage(provider, usage) {
  if (!usage || n(usage.input_tokens) === null || n(usage.output_tokens) === null) return null;
  const cacheRead = n(provider === 'anthropic' ? usage.cache_read_input_tokens : usage.input_tokens_details?.cached_tokens) ?? 0;
  const cacheWrite = n(provider === 'anthropic' ? usage.cache_creation_input_tokens : usage.input_tokens_details?.cache_write_tokens) ?? 0;
  const input = usage.input_tokens + (provider === 'anthropic' ? cacheRead + cacheWrite : 0);
  return {input, output:usage.output_tokens, total:input+usage.output_tokens, cacheRead, cacheWrite, reasoning:n(provider==='anthropic'?usage.output_tokens_details?.thinking_tokens:usage.output_tokens_details?.reasoning_tokens)};
}

export function textModel(provider,id) {
  if(typeof id!=='string')return false;
  if(provider==='anthropic')return /^claude-/.test(id)&&!/(mythos|research-preview)/.test(id);
  return /^(gpt-|o[134](?:-|$))/.test(id)&&!/(audio|realtime|image|transcri|tts|search|moderation|embedding|cyber|rosalind)/.test(id);
}

function priority(model,mode,chief=false){
  const id=model.id;let rank=10;
  if(/astra|fable|opus/.test(id))rank=90;
  else if(/sol|sonnet|gpt-5\.[456](?:-|$)|gpt-5(?:-|$)|o3/.test(id))rank=70;
  else if(/terra|gpt-4\.1(?:-|$)|gpt-4o$/.test(id))rank=50;
  if(/luna|haiku|mini|nano/.test(id))rank=30;
  const target=chief?(mode==='economy'?70:90):(mode==='economy'?30:mode==='quality'?90:70);
  return -Math.abs(rank-target)+(model.lifecycle==='deprecated'?-100:0);
}

export function chooseModels(catalogue,mode) {
  if(!['economy','balance','quality'].includes(mode))throw new KitchenError("Unknown mode.");
  const available=catalogue.filter(m=>textModel(m.provider,m.id)&&m.lifecycle!=='retired');
  if(!available.length)throw new KitchenError("No suitable text models are available.");
  const sorted=(items,chief)=>[...items].sort((a,b)=>priority(b,mode,chief)-priority(a,mode,chief)||b.id.localeCompare(a.id,undefined,{numeric:true}));
  const workers=['openai','anthropic'].flatMap(p=>sorted(available.filter(m=>m.provider===p),false).slice(0,3));
  return {chief:sorted(available,true)[0],workers};
}

export function validatePlan(value,catalogue) {
  if(value&&typeof value.title==='string'&&value.title.trim()&&value.title.length<=160&&Array.isArray(value.tasks)&&value.tasks.length===0&&typeof value.result==='string'&&value.result.trim()&&value.result.length<=60000)return {title:value.title.trim(),result:value.result,tasks:[]};
  if(!value||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||!Array.isArray(value.tasks)||value.tasks.length<1||value.tasks.length>5)throw new KitchenError("The head chef returned an invalid plan or task count.");
  const ids=new Set();
  for(const task of value.tasks){
    if(!task||typeof task.id!=='string'||!/^[a-z][a-z0-9_-]{0,29}$/.test(task.id)||ids.has(task.id)||task.id==='chef')throw new KitchenError("Invalid task identifier.");
    ids.add(task.id);
    if(typeof task.role!=='string'||!task.role.trim()||task.role.length>60||typeof task.task!=='string'||!task.task.trim()||task.task.length>3500)throw new KitchenError("Invalid task description.");
    if(!catalogue.some(m=>m.id===task.model&&m.provider===task.provider&&textModel(m.provider,m.id)))throw new KitchenError("The head chef selected an unavailable model.");
    if(!Array.isArray(task.dependsOn)||task.dependsOn.length>5||new Set(task.dependsOn).size!==task.dependsOn.length)throw new KitchenError("Invalid task dependencies.");
  }
  const visited=new Set(),visiting=new Set();
  function visit(id){if(visiting.has(id))throw new KitchenError("Cyclic task dependencies.");if(visited.has(id))return;const task=value.tasks.find(t=>t.id===id);if(!task)throw new KitchenError("Unknown task dependency.");visiting.add(id);for(const dep of task.dependsOn)visit(dep);visiting.delete(id);visited.add(id);}
  for(const task of value.tasks)visit(task.id);
  // Final synthesis must see every previous output; enforce this server-side.
  const tasks=value.tasks.map(t=>({id:t.id,role:t.role.trim(),task:t.task.trim(),provider:t.provider,model:t.model,complexity:t.complexity==='complex'?'complex':'simple',dependsOn:[...t.dependsOn]}));
  if(tasks.length>1){const last=tasks.at(-1);last.dependsOn=tasks.slice(0,-1).map(t=>t.id);last.task+="\nCheck all results for consistency and provide one final answer to the original request. Do not claim to have executed code or passed tests.";}
  // Enforced final dependencies must not create a cycle with an earlier task.
  if(tasks.slice(0,-1).some(t=>t.dependsOn.includes(tasks.at(-1).id)))throw new KitchenError("Earlier tasks cannot depend on the final task.");
  return {title:value.title.trim(),tasks};
}

/** @returns {{url:string,headers:Record<string,string>,body:object}} */
export function prepareProviderRequest(provider,key,model,system,prompt,maxOutput){
  if(!key)throw new KitchenError("Provider access is not configured.");
  if(!Number.isInteger(maxOutput)||maxOutput<256||maxOutput>8192)throw new KitchenError("Invalid response limit.");
  if(provider==='openai')return {url:'https://api.openai.com/v1/responses',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:{model,instructions:system,input:prompt,max_output_tokens:maxOutput,store:false,service_tier:'default',prompt_cache_options:{mode:'implicit',ttl:'30m'}}};
  if(provider==='anthropic')return {url:'https://api.anthropic.com/v1/messages',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:{model,system,messages:[{role:'user',content:prompt}],max_tokens:maxOutput,service_tier:'standard_only'}};
  throw new KitchenError("Unknown provider.");
}

export function readProviderResult(provider,value){
  const text=provider==='openai'?(value.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n'):(value.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('\n');
  const complete=Boolean(text.trim())&&(provider==='openai'?value.status==='completed':value.stop_reason==='end_turn');
  const usage=normalizeUsage(provider,value.usage);
  if(usage){usage.billingComplete=provider==='openai'?n(value.usage.input_tokens_details?.cached_tokens)!==null&&n(value.usage.input_tokens_details?.cache_write_tokens)!==null:n(value.usage.cache_read_input_tokens)!==null&&n(value.usage.cache_creation_input_tokens)!==null&&!(value.usage.cache_creation?.ephemeral_1h_input_tokens>0);}
  return {text,model:value.model||null,requestId:value.id||null,usage,complete,stopReason:provider==='openai'?(value.incomplete_details?.reason||value.status):value.stop_reason};
}

export function parsePlan(text,catalogue){
  let value=text.trim();if(value.startsWith('```'))value=value.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  let parsed;try{parsed=JSON.parse(value);}catch{throw new KitchenError("The head chef did not return a valid JSON plan. Planning costs have been saved.");}
  return validatePlan(parsed,catalogue);
}

export function nextTask(tasks){return tasks.find(t=>t.status==='queued'&&t.dependsOn.every(id=>tasks.some(d=>d.id===id&&d.status==='completed')))||null;}

export function makePlanningPrompt(prompt,mode,models){
  return `User request:
${prompt}

Mode: ${mode}. Available workers:
${JSON.stringify(models.map(m=>({provider:m.provider,model:m.id})))}

Minimize the number of calls. Solve a small task yourself in one response: {"title":"Title","tasks":[],"result":"Complete result, including code"}. For a project, create 1–5 tasks. Do not add roles just to increase headcount or involve both providers unnecessarily. Every task must include ALL relevant user requirements, language, filenames, interfaces and acceptance criteria: workers do NOT receive the original request or full history. Add dependencies only when their results are needed. When using multiple workers, the final task combines their results. Start with inexpensive models; a stronger model is used after review and user confirmation. The server enforces cost-routing rules. Return JSON only: {"title":"Title","tasks":[{"id":"task_1","role":"Role","task":"Self-contained assignment","complexity":"simple or complex","provider":"openai or anthropic","model":"exact ID","dependsOn":[]}]}. Use English for task titles, role labels and instructions unless the user explicitly requests another language. Preserve any language requirements for the deliverable. Do not request secrets. Do not claim to have executed code or tests.`;
}
