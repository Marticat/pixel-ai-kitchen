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
  if(!['economy','balance','quality'].includes(mode))throw new Error('Неизвестный режим.');
  const available=catalogue.filter(m=>textModel(m.provider,m.id)&&m.lifecycle!=='retired');
  if(!available.length)throw new Error('Нет подходящих текстовых моделей.');
  const sorted=(items,chief)=>[...items].sort((a,b)=>priority(b,mode,chief)-priority(a,mode,chief)||b.id.localeCompare(a.id,undefined,{numeric:true}));
  const workers=['openai','anthropic'].flatMap(p=>sorted(available.filter(m=>m.provider===p),false).slice(0,3));
  return {chief:sorted(available,true)[0],workers};
}

export function validatePlan(value,catalogue) {
  if(!value||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||!Array.isArray(value.tasks)||value.tasks.length<1||value.tasks.length>5)throw new Error('Шеф вернул некорректный план или число задач.');
  const ids=new Set();
  for(const task of value.tasks){
    if(!task||typeof task.id!=='string'||!/^[a-z][a-z0-9_-]{0,29}$/.test(task.id)||ids.has(task.id)||task.id==='chef')throw new Error('Некорректный идентификатор задачи.');
    ids.add(task.id);
    if(typeof task.role!=='string'||!task.role.trim()||task.role.length>60||typeof task.task!=='string'||!task.task.trim()||task.task.length>3500)throw new Error('Некорректное описание задачи.');
    if(!catalogue.some(m=>m.id===task.model&&m.provider===task.provider&&textModel(m.provider,m.id)))throw new Error('Шеф выбрал недоступную модель.');
    if(!Array.isArray(task.dependsOn)||task.dependsOn.length>5||new Set(task.dependsOn).size!==task.dependsOn.length)throw new Error('Некорректные зависимости задач.');
  }
  const visited=new Set(),visiting=new Set();
  function visit(id){if(visiting.has(id))throw new Error('Циклические зависимости задач.');if(visited.has(id))return;const task=value.tasks.find(t=>t.id===id);if(!task)throw new Error('Неизвестная зависимость задачи.');visiting.add(id);for(const dep of task.dependsOn)visit(dep);visiting.delete(id);visited.add(id);}
  for(const task of value.tasks)visit(task.id);
  // Final synthesis must see every previous output; enforce this server-side.
  const tasks=value.tasks.map(t=>({id:t.id,role:t.role.trim(),task:t.task.trim(),provider:t.provider,model:t.model,dependsOn:[...t.dependsOn]}));
  if(tasks.length>1){const last=tasks.at(-1);last.dependsOn=tasks.slice(0,-1).map(t=>t.id);last.task+='\nПроверь согласованность всех результатов и представь единый итоговый ответ на исходный запрос. Не утверждай, что код запускался или тесты проходили.';}
  // Enforced final dependencies must not create a cycle with an earlier task.
  if(tasks.slice(0,-1).some(t=>t.dependsOn.includes(tasks.at(-1).id)))throw new Error('Последняя задача не может быть зависимостью предыдущих задач.');
  return {title:value.title.trim(),tasks};
}

/** @returns {{url:string,headers:Record<string,string>,body:object}} */
export function prepareProviderRequest(provider,key,model,system,prompt,maxOutput){
  if(!key)throw new Error('Доступ к провайдеру не настроен.');
  if(!Number.isInteger(maxOutput)||maxOutput<256||maxOutput>8192)throw new Error('Некорректный лимит ответа.');
  if(provider==='openai')return {url:'https://api.openai.com/v1/responses',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:{model,instructions:system,input:prompt,max_output_tokens:maxOutput,store:false,service_tier:'default',prompt_cache_options:{mode:'implicit',ttl:'30m'}}};
  if(provider==='anthropic')return {url:'https://api.anthropic.com/v1/messages',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:{model,system,messages:[{role:'user',content:prompt}],max_tokens:maxOutput,service_tier:'standard_only'}};
  throw new Error('Неизвестный провайдер.');
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
  let parsed;try{parsed=JSON.parse(value);}catch{throw new Error('Шеф не вернул корректный JSON-план. Расход планирования сохранён.');}
  return validatePlan(parsed,catalogue);
}

export function nextTask(tasks){return tasks.find(t=>t.status==='queued'&&t.dependsOn.every(id=>tasks.some(d=>d.id===id&&d.status==='completed')))||null;}

export function makePlanningPrompt(prompt,mode,models){
  return `Запрос пользователя:\n${prompt}\n\nРежим: ${mode}. Доступные исполнители (используй только точные пары provider/model):\n${JSON.stringify(models.map(m=>({provider:m.provider,model:m.id})))}\n\nРазбей запрос на 2–5 конкретных задач, включая последнюю задачу проверки и объединения результатов. Выбирай модель под сложность задачи и режим расходов. По возможности используй обоих провайдеров. Задачи будут выполняться последовательно с передачей результатов зависимостей. Последняя задача должна зависеть от всех предыдущих. Ответ только JSON без Markdown: {"title":"Короткое название", "tasks":[{"id":"task_1","role":"Короткая роль на русском","task":"Что конкретно подготовить и критерии результата","provider":"openai или anthropic","model":"точный ID","dependsOn":[]}]} . Не выполняй задачи сейчас. Не запрашивай секреты. Не придумывай выполненные действия.`;
}
