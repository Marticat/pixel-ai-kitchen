import type {Run} from '@/lib/kitchen-types';
import {receiptRows} from '@/lib/kitchen-money.mjs';
export const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
export const money=(micros:number)=>'$'+(micros/1e6).toFixed(micros>0&&micros<100?6:4);
export const labels:Record<string,string>={draft:'Смета',budget:'Остановлен до проверки бюджета',queued:'Ожидает этапа',running:'Пишет код',completed:'Готово',incomplete:'Неполный ответ',error:'Нужна помощь',ready:'Готов к работе',cancelled:'Заказ отменён'};
export const modeNames={economy:'Экономия',balance:'Баланс',quality:'Качество'};
export function exportReceipt(run:Run){
 const cell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
 const rows=[['Заказ','Повар','Версия','Работа','Провайдер','Модель','Входящие токены','Исходящие токены','Стоимость USD','Резерв USD','Статус расхода','ID запроса'],...receiptRows(run).map(r=>[run.id,r.role,r.revision+1,r.category,r.provider,r.actualModel||r.model,r.usage?.input,r.usage?.output,r.cost?.state==='settled'?(r.cost.micros!/1e6).toFixed(6):'',r.cost&&r.cost.state!=='settled'?(r.cost.reservedMicros/1e6).toFixed(6):'0',r.cost?.state||'unknown',r.requestId])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='kitchen-receipt.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function api<T=Run>(path:string,body?:unknown):Promise<T>{const r=await fetch('/api/kitchen/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let value:T&{error?:string};try{value=await r.json() as T&{error?:string};}catch{throw new Error('Сервер не ответил. Обновите состояние заказа перед продолжением.');}if(!r.ok)throw new Error(value.error||'Не удалось выполнить запрос.');return value;}
export function exportRun(run:Run){const nl=String.fromCharCode(10);const text=['# '+run.title,run.prompt,'Бюджет USD: '+(run.budgetMicros===undefined?'не задан':money(run.budgetMicros)),...run.tasks.map(t=>['## '+t.role,'Модель: '+(t.actualModel||t.model),'Статус: '+labels[t.status],'Токены: '+(t.usage?.total??'неизвестно'),'Стоимость USD: '+(t.cost?.state==='settled'?money(t.cost.micros!):t.cost?'неизвестна':'нет данных'),t.output||t.error||'Результат ещё не получен.'].join(nl+nl))].join(nl+nl);const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='kitchen-project.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

