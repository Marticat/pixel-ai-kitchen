'use client';
import {useState} from 'react';
import type {Run} from '@/lib/kitchen-types';
import {ledger} from '@/lib/kitchen-money.mjs';
import {money} from './kitchen-client';
export default function BudgetPanel({run,busy,save}:{run:Run;busy:boolean;save:(amount:string)=>Promise<void>}){
 const [amount,setAmount]=useState(((run.budgetMicros||0)/1e6).toFixed(2)),[saving,setSaving]=useState(false),funds=ledger(run);
 if(run.budgetMicros===undefined)return <div className="money-warning">У старого заказа нет сметы и бюджета. Для нового запуска сначала рассчитай смету.</div>;
 return <section className="money-summary" aria-label="Расходы заказа"><div className="money-metrics"><div><span>Бюджет</span><strong>{money(run.budgetMicros)}</strong></div><div><span>По полученным токенам</span><strong>{money(funds.spent)}</strong></div><div><span>{funds.unknown?'Резерв · расход неизвестен':'Зарезервировано'}</span><strong>{money(funds.reserved)}</strong></div><div><span>Доступно для новых задач</span><strong>{money(funds.remaining)}</strong></div></div><p className="live-small">USD · Расчёт по тарифам на {run.pricingDate}. Резерв не означает списание. Не включает налоги и другие заказы.</p>{run.budgetStop&&<p className="money-warning" role="status">{run.budgetStop}</p>}{funds.unknown&&<p className="money-warning">Часть расхода неизвестна. Резерв сохранён; новые вызовы остановлены. Проверь счёт у провайдера.</p>}{run.status==='budget'&&!funds.unknown&&<form className="money-actions" onSubmit={async e=>{e.preventDefault();setSaving(true);try{await save(amount);}finally{setSaving(false);}}}><label>Новый общий бюджет, USD <input aria-label="Новый общий бюджет, USD" type="number" min="0.01" max="1000" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="ak-quiet" disabled={busy||saving}>Сохранить бюджет</button><span className="live-small">Продолжение запускается отдельно. Готовые задачи сохранятся.</span></form>}</section>;
}
