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
 return <section className="iteration-actions" aria-label="Task revisions">
  <span className="ak-caption">REFINE THIS PART</span><p className="live-small">Revisions: {revision}  / 2. Other results stay intact. Every request counts toward the total budget.</p>
  {task.stale&&<p className="money-warning">A dependency of this part has changed. The result is preserved, but needs checking.</p>}
  {run.tasks.some(t=>t.kind==='review'&&t.targetId===task.id&&t.status==='running')&&<p className="live-message" role="status">The reviewer is analyzing the result…</p>}
  {task.review&&<div className={task.review.passed?'live-message':'money-warning'}><strong>{task.review.passed?"The model found no issues":"Review found issues"}</strong>{task.review.issues.length>0&&<ul>{task.review.issues.map((s,i)=><li key={i}>{s}</li>)}</ul>}<p className="live-small">Text and code analysis only. No tests were run.</p></div>}
  {!eligible&&<p className="live-small">Revisions become available once all requests have stopped and costs are known.</p>}
  {eligible&&<><label htmlFor={'fix-'+task.id}>What should change?</label><textarea id={'fix-'+task.id} rows={3} maxLength={2000} value={feedback} onChange={e=>setFeedback(e.target.value)} disabled={busy||revision>=2} placeholder="For example: add a remove-item button to the cart"/><div className="money-actions"><button className="ak-quiet" disabled={busy||revision>=2||!feedback.trim()} onClick={()=>quote(task.id,'repair',feedback)}>Estimate revision</button><button className="ak-quiet" disabled={busy||!canReview} onClick={()=>quote(task.id,'review','')}>Review · get price</button>{task.review&&!task.review.passed&&<button className="ak-quiet" disabled={busy||revision>=2} onClick={()=>quote(task.id,'escalate',feedback)}>Stronger chef · get price</button>}</div></>}
  {refreshable&&<button className="ak-quiet" disabled={busy} onClick={()=>quote(pending!.id,'refresh','')}>Re-estimate paused action</button>}
  {q&&(eligible||refreshable)&&<div className="iteration-quote"><span className="ak-caption">{q.task.kind==='review'?"REVIEW":q.task.operation==='escalate'?"ESCALATION":"REVISION"}  · ADDITIONAL REQUEST</span><p>{q.previousModel}{q.previousModel!==q.task.model?' → '+q.task.model:''}</p><strong>Reserve up to {money(q.reserveMicros)}</strong><p className="live-small">Charged based on actual tokens. Available: {money(funds.remaining)}. This uses your existing budget; it is not an account top-up.</p>{q.feedback&&<p className="iteration-feedback">{q.feedback}</p>}<p className="live-small">Materials: {q.input.context.sources.map(s=>s.role+(s.trimmed?" (excerpt)":'')).join(', ')||"task only"}. {fmt(q.input.context.includedChars)}  characters of material, plus instructions.</p>{q.reserveMicros>funds.remaining&&<p className="money-warning">Not enough budget. Increase the total limit above and estimate this action again.</p>}<button className="ak-main" disabled={busy||clock>q.expiresAt||q.reserveMicros>funds.remaining} onClick={()=>accept(q.id)}>{clock>q.expiresAt?"Estimate expired":busy?"Please wait…":"Confirm · up to "+money(q.reserveMicros)}</button><p className="live-small">Generation starts only after confirmation.</p></div>}
 </section>;
}
