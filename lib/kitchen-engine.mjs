import {makePlanningPrompt,nextTask,parsePlan} from './kitchen-core.mjs';
import {assertPricingFresh,ledger,priceUsage,rateFor,reserveCost} from './kitchen-money.mjs';
import {buildTaskInput,parseReview,routePlan,currentTasks} from './kitchen-workflow.mjs';
export async function performStep(store,id,user,invoke,countInput){
  let run=await store.load(id,user);
  if(!run)throw new Error('Заказ не найден.');
  if(run.paused)throw new Error('Заказ на паузе.');
  const lease=await store.acquire(id,user);
  if(!lease)throw new Error('Заказ уже выполняется или недоступен для запуска.');
  run=await store.load(id,user);
  if(!run)throw new Error('Заказ не найден после блокировки.');
  if(run.paused||run.status==='cancelled'){if(run.status!=='cancelled')run.status='ready';await store.save(id,user,lease,run,true);return await store.load(id,user);}
  const task=run.pendingTaskId?run.tasks.find(t=>t.id===run.pendingTaskId&&t.status==='queued'):nextTask(run.tasks);
  if(!task){run.status=currentTasks(run).every(t=>t.status==='completed')?'completed':'error';await store.save(id,user,lease,run,true);return run;}
  const planning=task.id==='chef'&&task.kind!=='work';
  const args=task.preparedInput||buildTaskInput(run,task);task.context=args.context;
  let rate,reserve;
  try{
    if(!Number.isSafeInteger(run.budgetMicros)||run.budgetMicros<1||!run.pricingDate)throw new Error('У заказа нет бюджета. Создайте новую смету перед запуском.');
    assertPricingFresh(run.pricingDate);rate=run.rates?.[task.provider+'/'+task.model];
    if(!rate)throw new Error('Нет проверенного тарифа выбранного повара.');
    const funds=ledger(run);if(funds.unknown||funds.reserved)throw new Error('Расход предыдущего запроса неизвестен. Новые платные запросы остановлены.');
    if(typeof countInput!=='function')throw new Error('Подсчёт входящих токенов недоступен.');
    const input=await countInput(args);reserve=reserveCost(rate,input,args.maxOutput);
    if(task.approvedReserveMicros&&reserve.micros>task.approvedReserveMicros)throw new Error('Резерв вырос после подтверждения. Платный вызов остановлен; прежняя доплата не превышена.');
    task.estimatedReserveMicros=reserve.micros;
    if(reserve.micros>funds.remaining)throw new Error(`Недостаточный бюджет: нужно зарезервировать $${(reserve.micros/1e6).toFixed(4)}, доступно $${(funds.remaining/1e6).toFixed(4)}. Запрос не отправлен.`);
  }catch(error){run.status='budget';run.budgetStop=error instanceof Error&&/[А-Яа-яЁё]/.test(error.message)?error.message:'Не удалось проверить стоимость запроса. Платный вызов не выполнялся.';await store.save(id,user,lease,run,true);return await store.load(id,user);}
  // A pause/cancel arriving during token counting must prevent generation.
  const latest=await store.load(id,user);
  if(!latest)throw new Error('Заказ не найден.');
  if(latest.paused||latest.status==='cancelled'){run.status=latest.status==='cancelled'?'cancelled':'ready';await store.save(id,user,lease,run,true);return await store.load(id,user);}
  task.cost={state:'reserved',micros:null,reservedMicros:reserve.micros,inputTokensReserved:reserve.inputTokens,rate};
  task.status='running';task.startedAt=new Date().toISOString();run.status='running';run.budgetStop=null;
  const prepared=await store.save(id,user,lease,run,false);
  if(prepared===false){delete task.cost;delete task.startedAt;task.status='queued';run.status='ready';await store.save(id,user,lease,run,true);return await store.load(id,user);}
  try{
    const result=await invoke(args);
    task.output=result.text;task.usage=result.usage;task.actualModel=result.model||task.model;task.requestId=result.requestId||null;task.stopReason=result.stopReason||null;
    const actual=rateFor(task.provider,task.actualModel),cost=actual?.id===rate.id?priceUsage(rate,result.usage):null;
    if(!cost){task.cost.state='unknown';throw new Error('Стоимость ответа неизвестна: нет полных данных о токенах или тарифе. Следующие повара остановлены.');}
    task.cost={...task.cost,state:'settled',micros:cost.total,breakdown:cost};
    if(cost.total>reserve.micros)throw new Error('Фактическая стоимость превысила резерв. Расход сохранён, дальнейшая работа остановлена для проверки.');
    if(!result.complete){task.status='incomplete';task.error='Ответ неполный: достигнут лимит, получен отказ или модель не завершила ответ. Автоповтор отключён.';run.status='error';}
    else{
      if(planning){const plan=parsePlan(result.text,run.catalogue);run.title=plan.title;if(plan.result){task.output=plan.result;task.kind='work';task.task=run.prompt;}else run.tasks.push(...routePlan(plan.tasks,run).map(t=>({...t,kind:'work',status:'queued',output:'',usage:null})));}
      if(task.kind==='review'){const verdict=parseReview(result.text),target=run.tasks.find(t=>t.id===task.targetId);if(target&&(target.revision||0)===task.targetRevision)target.review={...verdict,revision:task.targetRevision,checkedAt:new Date().toISOString()};}
      task.status='completed';const active=currentTasks(run);run.status=active.every(t=>t.status==='completed')?'completed':active.some(t=>['error','incomplete'].includes(t.status))?'error':'ready';
    }
  }catch(error){if(task.cost.state==='reserved')task.cost.state='unknown';task.status='error';task.error=error instanceof Error?error.message:'Не удалось выполнить задачу.';run.status='error';}
  delete run.pendingTaskId;delete task.preparedInput;
  task.finishedAt=new Date().toISOString();await store.save(id,user,lease,run,true);return await store.load(id,user);
}
