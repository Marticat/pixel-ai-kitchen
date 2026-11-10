'use client';
import {useState} from 'react';
import type {Settings} from '@/lib/kitchen-types';
export default function Connections({settings,loading,refresh,save}:{settings:Settings|null;loading:boolean;refresh:()=>void;save:(keys:{openai:string;anthropic:string})=>Promise<void>}){
 const [keys,setKeys]=useState({openai:'',anthropic:''}),[busy,setBusy]=useState(false);
 return <section className="live-settings" aria-label="Подключение моделей">
  <div><span className="ak-eyebrow">СНАБЖЕНИЕ КУХНИ</span><h2>Подключи своих поваров</h2><p>Прямое подключение к OpenAI и Anthropic. Никаких дополнительных программ.</p><p className="live-small">Ключи отправляются только на сервер этой приватной кухни и соответствующему провайдеру. Хранятся в зашифрованном виде, в браузере не сохраняются.</p></div>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save(keys);setKeys({openai:'',anthropic:''});}catch{/* Error is shown by the parent. */}finally{setBusy(false);}}}>
   {(['openai','anthropic'] as const).map(p=><label key={p}>{p==='openai'?'OpenAI':'Anthropic'} {settings?.[p]&&!settings.errors[p]?'· подключён':''}<input type="password" autoComplete="off" value={keys[p]} onChange={e=>setKeys({...keys,[p]:e.target.value})} placeholder={settings?.[p]?'Новый ключ для замены':'API-ключ'}/><a href={p==='openai'?'https://platform.openai.com/api-keys':'https://platform.claude.com/settings/keys'} target="_blank" rel="noreferrer">Получить ключ ↗</a>{settings?.errors[p]&&<span className="live-error">{settings.errors[p]}</span>}</label>)}
   <div className="live-settings-actions"><button className="ak-main" disabled={busy||!settings?.vaultReady||(!keys.openai&&!keys.anthropic)}>{busy?'Проверяю…':'Сохранить и проверить'}</button><button className="ak-quiet" type="button" onClick={refresh} disabled={loading}>{loading?'Проверяю…':'Обновить подключения'}</button></div>
   {!settings?.vaultReady&&<p className="live-small">{loading?'Проверяю настройки сервера…':'Хранилище ключей пока недоступно.'}</p>}
  </form>
  {Boolean(settings?.models.length)&&<details className="live-catalog"><summary>Доступные модели: {settings!.models.length}</summary><p className="live-small">Каталог получен от провайдеров. На задачи назначаются текстовые модели; специализированные модели только перечислены.</p><div>{settings!.models.map(m=><span key={m.provider+m.id}>{m.provider} / {m.name||m.id}</span>)}</div></details>}
 </section>;
}

