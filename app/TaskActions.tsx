'use client';
import {useEffect,useState} from 'react';
import type {Run,Task} from '@/lib/kitchen-types';
import {ledger} from '@/lib/kitchen-money.mjs';
import {fmt,money} from './kitchen-client';
export default function TaskActions({run,task,busy,quote,accept}:{run:Run;task:Task;busy:boolean;quote:(taskId:string,action:string,feedback:string)=>Promise<void>;accept:(id:string)=>Promise<void>}){
 const [feedback,setFeedback]=useState(''),[clock,setClock]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const funds=ledger(run),eligible=['completed','error'].includes(run.status)&&!funds.unknown&&!funds.reserved&&!run.uncertain&&!run.leaseUntil;
 if(task.kind==='review'||task.id==='chef'&&task.kind!=='work')return null;
 const pending=run.tasks.find(t=>t.id===run.pendingTaskId&&(t.id===task.id||t.targetId===task.id)&&t.status==='queued'&&!t.cost&&t.approvedReserveMicros);
 const refreshable=Boolean(pending&&['budget','ready'].includes(run.status)&&!funds.unknown&&!funds.reserved&&!run.leaseUntil);
 const q=run.actionQuote&&(run.actionQuote.taskId===task.id||run.actionQuote.task.targetId===task.id)?run.actionQuote:null,revision=task.revision||0,canReview=Boolean(task.output)&&!run.tasks.some(t=>t.kind==='review'&&t.targetId===task.id&&t.targetRevision===revision);
 return <section className="iteration-actions" aria-label="Доработка задачи">
  <span className="ak-caption">ДОРАБОТАТЬ ЭТУ ЧАСТЬ</span><p className="live-small">Исправления: {revision} / 2. Остальные результаты сохранятся. Каждый запрос входит в общий бюджет.</p>
  {task.stale&&<p className="money-warning">Материал, от которого зависит эта часть, изменился. Результат сохранён, но его нужно сверить.</p>}
  {run.tasks.some(t=>t.kind==='review'&&t.targetId===task.id&&t.status==='running')&&<p className="live-message" role="status">Проверяющий анализирует результат…</p>}
  {task.review&&<div className={task.review.passed?'live-message':'money-warning'}><strong>{task.review.passed?'По анализу модели замечаний нет':'Проверка нашла проблемы'}</strong>{task.review.issues.length>0&&<ul>{task.review.issues.map((s,i)=><li key={i}>{s}</li>)}</ul>}<p className="live-small">Анализ текста и кода, без запуска тестов.</p></div>}
  {!eligible&&<p className="live-small">Доработка доступна после остановки всех запросов и получения данных о расходах.</p>}
  {eligible&&<><label htmlFor={'fix-'+task.id}>Что изменить?</label><textarea id={'fix-'+task.id} rows={3} maxLength={2000} value={feedback} onChange={e=>setFeedback(e.target.value)} disabled={busy||revision>=2} placeholder="Например: добавь удаление товара из корзины"/><div className="money-actions"><button className="ak-quiet" disabled={busy||revision>=2||!feedback.trim()} onClick={()=>quote(task.id,'repair',feedback)}>Смета исправления</button><button className="ak-quiet" disabled={busy||!canReview} onClick={()=>quote(task.id,'review','')}>Проверить · узнать цену</button>{task.review&&!task.review.passed&&<button className="ak-quiet" disabled={busy||revision>=2} onClick={()=>quote(task.id,'escalate',feedback)}>Позвать сильнее · узнать цену</button>}</div></>}
  {refreshable&&<button className="ak-quiet" disabled={busy} onClick={()=>quote(pending!.id,'refresh','')}>Пересчитать остановленное действие</button>}
  {q&&(eligible||refreshable)&&<div className="iteration-quote"><span className="ak-caption">{q.task.kind==='review'?'ПРОВЕРКА':q.task.operation==='escalate'?'УСИЛЕНИЕ':'ИСПРАВЛЕНИЕ'} · ДОПОЛНИТЕЛЬНЫЙ ЗАПРОС</span><p>{q.previousModel}{q.previousModel!==q.task.model?' → '+q.task.model:''}</p><strong>Резерв до {money(q.reserveMicros)}</strong><p className="live-small">Будет оплачено по фактическим токенам. Доступно: {money(funds.remaining)}. Это расход внутри бюджета, а не новое пополнение.</p>{q.feedback&&<p className="iteration-feedback">{q.feedback}</p>}<p className="live-small">Материалы: {q.input.context.sources.map(s=>s.role+(s.trimmed?' (выдержка)':'')).join(', ')||'только задание'}. {fmt(q.input.context.includedChars)} символов материалов, плюс инструкции.</p>{q.reserveMicros>funds.remaining&&<p className="money-warning">Недостаточно бюджета. Увеличь общий лимит выше и пересчитай действие.</p>}<button className="ak-main" disabled={busy||clock>q.expiresAt||q.reserveMicros>funds.remaining} onClick={()=>accept(q.id)}>{clock>q.expiresAt?'Смета устарела':busy?'Подожди…':'Подтвердить · до '+money(q.reserveMicros)}</button><p className="live-small">До подтверждения генерация не запускается.</p></div>}
 </section>;
}
