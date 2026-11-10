'use client';
import {useEffect,useState} from 'react';
import type {Run} from '@/lib/kitchen-types';
import {money} from './kitchen-client';
import {PRICE_SOURCES} from '@/lib/kitchen-money.mjs';
export default function QuotePanel({quote,busy,connected,start,connect}:{quote:Run;busy:boolean;connected:boolean;start:()=>void;connect:()=>void}){
 const [clock,setClock]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const e=quote.estimate!,expired=clock>(quote.quoteExpiresAt||0),over=e.highMicros>quote.budgetMicros!;
 return <section className="money-quote" aria-label="Смета перед запуском">
  <div className="money-heading"><div><span className="ak-eyebrow">СМЕТА · БЕСПЛАТНЫЙ РАСЧЁТ</span><h2>{money(e.lowMicros)} – {money(e.highMicros)}</h2><p className="live-small">{quote.workMode==='single'?'Один повар выполнит запрос напрямую. Отдельного вызова на планирование нет.':'Шеф решит маленькую задачу сам или назначит 1–5 исполнителей. Состав определится после первого ответа.'}</p></div><div className="money-limit"><span>Твой бюджет</span><strong>{money(quote.budgetMicros!)}</strong><span>USD на весь заказ</span></div></div>
  <div className="money-table-wrap"><table className="money-table"><thead><tr><th>Этап</th><th>Модели</th><th>Ориентир, USD</th></tr></thead><tbody>{e.rows.map(row=><tr key={row.label}><td>{row.label}</td><td>{row.models.join(', ')}</td><td>{money(row.lowMicros)} – {money(row.highMicros)}</td></tr>)}</tbody></table></div>
  {over&&<p className="money-warning">Бюджет ниже верхней границы сметы. Работа может остановиться до завершения всех задач. Увеличь бюджет или выбери «Экономия».</p>}
  {!quote.availabilityVerified&&<p className="live-small">Пока это расчёт по каталогу тарифов. Доступность моделей проверим после подключения ключей. Если набор моделей отличается, потребуется новая смета.</p>}
  <details className="live-small"><summary>Как считается цена</summary><p>Это диапазон сценариев, а не гарантированная цена: длина ответов и состав команды пока неизвестны. Перед каждым вызовом проверяются входящие токены и резервируется максимальный ответ с запасом. Неизвестный расход останавливает следующие вызовы.</p><p>Стандартные тарифы в USD, проверены {e.verifiedAt}. Без налогов, пополнений баланса и расходов вне этого заказа. Итоговый счёт определяет провайдер. Непроверенные модели не назначаются.</p><p><a href={PRICE_SOURCES.openai} target="_blank" rel="noreferrer">Тарифы OpenAI ↗</a> · <a href={PRICE_SOURCES.anthropic} target="_blank" rel="noreferrer">Тарифы Anthropic ↗</a></p></details>
  <div className="money-actions"><button className="ak-main" disabled={busy||!connected||expired} onClick={start}>{busy?'Запускаю…':'Начать · бюджет '+money(quote.budgetMicros!)}</button>{!connected&&<button className="ak-quiet" onClick={connect}>Подключить модели</button>}<span className="live-small">{expired?'Смета устарела — рассчитай заново.':'До нажатия «Начать» платных вызовов нет.'}</span></div>
 </section>;
}
