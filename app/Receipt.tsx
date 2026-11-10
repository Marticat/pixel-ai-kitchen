'use client';
import type {Run} from '@/lib/kitchen-types';
import {ledger,receiptRows} from '@/lib/kitchen-money.mjs';
import {exportReceipt,fmt,money} from './kitchen-client';
export default function Receipt({run}:{run:Run}){
 const rows=receiptRows(run),funds=ledger(run),categories=['Планирование','Создание','Проверка','Исправление','Усиление'];
 return <section className="receipt" aria-label="Чек заказа"><div className="money-heading"><div><span className="ak-eyebrow">ЧЕК ЗАКАЗА · USD</span><h2>{money(funds.spent)}</h2><p className="live-small">По полученным токенам. Все версии и проверки включены.</p></div><button className="ak-quiet" onClick={()=>exportReceipt(run)}>Скачать чек .csv</button></div>
  <div className="receipt-categories">{categories.map(category=><div key={category}><span>{category}</span><strong>{money(rows.filter(r=>r.category===category&&r.cost?.state==='settled').reduce((n,r)=>n+(r.cost?.micros||0),0))}</strong></div>)}</div>
  <div className="money-table-wrap"><table className="money-table"><thead><tr><th>Повар / версия</th><th>Модель и работа</th><th>Токены</th><th>Стоимость</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.taskId+'-'+i}><td>{row.role}<small>Версия {row.revision+1}</small></td><td>{row.actualModel||row.model}<small>{row.category}</small></td><td>{row.usage?fmt(row.usage.total):'Нет данных'}</td><td>{row.cost?.state==='settled'?money(row.cost.micros!):'Неизвестна'}{row.cost&&row.cost.state!=='settled'&&<small>Резерв {money(row.cost.reservedMicros)}</small>}</td></tr>)}</tbody></table>{!rows.length&&<p className="live-small">Платных запросов ещё нет. Здесь появится каждая попытка.</p>}</div>
  <p className="live-small">Тарифы от {run.pricingDate}. Это расчёт расхода API, не платёжный документ провайдера. Резерв {money(funds.reserved)} учитывается отдельно. Экономию в процентах без проверенного сравнения не заявляем.</p>
 </section>;
}
