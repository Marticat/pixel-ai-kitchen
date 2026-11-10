'use client';
import {useState} from 'react';
import Chef from './Chef';
import type {Task} from '@/lib/kitchen-types';
import {fmt,labels} from './kitchen-client';
export default function TaskPanel({task,index,uncertain,message}:{task?:Task;index:number;uncertain?:boolean;message:(text:string)=>void}){
 const [panel,setPanel]=useState<'task'|'result'>('task');
 return <aside className="ak-detail" aria-label="Карточка повара">{task?<>
  <div className="ak-detail-top"><span className="ak-eyebrow">ЗА РАБОЧИМ СТОЛОМ</span><span>{String(index+1).padStart(2,'0')}</span></div>
  <div className="ak-person"><div id="ak-detail-avatar"><Chef index={index} working={task.status==='running'&&!uncertain} done={task.status==='completed'}/></div><div><h2>{task.role}</h2><span className="ak-state">{uncertain&&task.status==='running'?'Ответ неизвестен':labels[task.status]}</span></div></div>
  <div className="ak-divider"/><span className="ak-caption">МОДЕЛЬ</span><div className="ak-model"><span id="ak-provider-mark">{task.provider==='openai'?'O':'A'}</span><div><strong>{task.actualModel||task.model}</strong><span id="ak-provider">{task.provider==='openai'?'OpenAI':'Anthropic'}</span></div></div>
  <div className="live-detail-tabs"><button aria-pressed={panel==='task'} onClick={()=>setPanel('task')}>Задача</button><button aria-pressed={panel==='result'} onClick={()=>setPanel('result')}>Результат</button></div>
  {panel==='task'?<p id="ak-task">{task.task}</p>:<div><pre className="live-result">{task.output||(task.status==='running'?'Модель готовит ответ…':'Ответ ещё не получен.')}</pre>{task.output&&<button className="ak-quiet" onClick={async()=>{try{await navigator.clipboard.writeText(task.output);message('Результат скопирован.');}catch{message('Используй «Скачать проект», если копирование недоступно.');}}}>Скопировать</button>}</div>}
  {task.error&&<p className="live-error">{task.error}</p>}
  <div className="ak-divider"/><div className="ak-token-head"><span className="ak-caption">ТОКЕНЫ ПОВАРА</span><span className="ak-sim-tag">{task.usage?'Данные API':'Нет данных API'}</span></div><div className="ak-token-total">{task.usage?fmt(task.usage.total):'—'}</div><div className="ak-token-parts"><div><span>Входящие</span><strong>{task.usage?fmt(task.usage.input):'—'}</strong></div><div><span>Исходящие</span><strong>{task.usage?fmt(task.usage.output):'—'}</strong></div></div>
  {task.usage&&<details className="live-small"><summary>Кэш и рассуждения</summary><p>Из кэша: {fmt(task.usage.cacheRead)} · В кэш: {fmt(task.usage.cacheWrite)}<br/>Рассуждения: {task.usage.reasoning===null?'не выделены API':fmt(task.usage.reasoning)}<br/>Эти значения уже учтены в сумме.</p></details>}
  <div className="ak-terminal" data-active={task.status==='running'&&!uncertain}><div className="ak-terminal-title"><span>LIVE / {task.provider.toUpperCase()}</span><span>{task.status==='running'?'WORKING':task.status==='completed'?'DONE':'WAIT'}</span></div><p className="ak-terminal-code">{task.status==='running'?'Запрос отправлен. Ждём ответ провайдера…':task.output?'Ответ сохранён. Открой вкладку «Результат».':'Задача в очереди.'}<span className="ak-terminal-cursor" aria-hidden="true"/></p></div>
 </>:<div className="live-empty-detail"><Chef index={0}/><h2>Твой будущий шеф</h2><p>После запуска здесь появятся задача, модель и реальные токены выбранного повара.</p><span className="live-small">Токены не симулируются.</span></div>}</aside>;
}
