import {identity,getSettings,updateSettings,listRuns,loadRun,createRun,controlRun,stepRun,startRun,updateBudget,quoteAction,acceptAction} from '@/lib/kitchen-server';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function handle(request:Request){
 try{
  const user=identity(request),parts=new URL(request.url).pathname.replace('/api/kitchen/','').split('/');let body:Record<string,unknown>={};
  if(request.method==='POST'){const text=await request.text();if(text.length>18000)return json({error:'Слишком большой запрос.'},413);try{body=JSON.parse(text);}catch{return json({error:'Некорректный JSON.'},400);}if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'Некорректный запрос.'},400);}
  if(parts[0]==='settings'&&parts.length===1)return json(request.method==='POST'?await updateSettings(user,body):await getSettings(user));
  if(parts[0]==='runs'&&parts.length===1)return json(request.method==='POST'?await createRun(user,body):await listRuns(user));
  if(parts[0]==='runs'&&parts[1]&&parts.length===3&&request.method==='POST'){if(parts[2]==='action-quote')return json(await quoteAction(user,parts[1],body));if(parts[2]==='action-start')return json(await acceptAction(user,parts[1],body.quoteId));}
  if(parts[0]==='runs'&&parts[1]&&parts.length===3&&request.method==='POST'){if(parts[2]==='start')return json(await startRun(user,parts[1]));if(parts[2]==='budget')return json(await updateBudget(user,parts[1],body.budgetUsd));}
  if(parts[0]==='runs'&&parts[1]){if(parts.length===2&&request.method==='GET'){const run=await loadRun(user,parts[1]);return run?json(run):json({error:'Заказ не найден.'},404);}if(parts[2]==='step'&&request.method==='POST')return json(await stepRun(user,parts[1]));if(parts[2]==='control'&&request.method==='POST')return json(await controlRun(user,parts[1],String(body.action)));}
  return json({error:'Маршрут не найден.'},404);
 }catch(error){const message=error instanceof Error?error.message:'Не удалось выполнить запрос.';const safe=/[А-Яа-яЁё]/.test(message)?message:'Сервис временно недоступен. Попробуйте позже.';return json({error:safe},message.includes('Войдите')?401:400);}
}
export const GET=handle;export const POST=handle;
