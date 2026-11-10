'use client';
import {useState} from 'react';
import type {Settings} from '@/lib/kitchen-types';
export default function Connections({settings,loading,refresh,save}:{settings:Settings|null;loading:boolean;refresh:()=>void;save:(keys:{openai:string;anthropic:string})=>Promise<void>}){
 const [keys,setKeys]=useState({openai:'',anthropic:''}),[busy,setBusy]=useState(false);
 return <section className="live-settings" aria-label="Model connections">
  <div><span className="ak-eyebrow">KITCHEN SUPPLIES</span><h2>Connect your chefs</h2><p>Connect directly to OpenAI and Anthropic. No extra software required.</p><p className="live-small">Keys are sent only to this private kitchen server and the corresponding provider. They are stored encrypted, never in your browser.</p></div>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save(keys);setKeys({openai:'',anthropic:''});}catch{/* Error is shown by the parent. */}finally{setBusy(false);}}}>
   {(['openai','anthropic'] as const).map(p=><label key={p}>{p==='openai'?'OpenAI':'Anthropic'} {settings?.[p]&&!settings.errors[p]?"· connected":''}<input type="password" autoComplete="off" value={keys[p]} onChange={e=>setKeys({...keys,[p]:e.target.value})} placeholder={settings?.[p]?"New replacement key":"API key"}/><a href={p==='openai'?'https://platform.openai.com/api-keys':'https://platform.claude.com/settings/keys'} target="_blank" rel="noreferrer">Get an API key ↗</a>{settings?.errors[p]&&<span className="live-error">{settings.errors[p]}</span>}</label>)}
   <div className="live-settings-actions"><button className="ak-main" disabled={busy||!settings?.vaultReady||(!keys.openai&&!keys.anthropic)}>{busy?"Checking…":"Save and verify"}</button><button className="ak-quiet" type="button" onClick={refresh} disabled={loading}>{loading?"Checking…":"Refresh connections"}</button></div>
   {!settings?.vaultReady&&<p className="live-small">{loading?"Checking server settings…":"Key storage is currently unavailable."}</p>}
  </form>
  {Boolean(settings?.models.length)&&<details className="live-catalog"><summary>Available models: {settings!.models.length}</summary><p className="live-small">This catalog comes from the providers. Text models can be assigned tasks; specialized models are listed for reference only.</p><div>{settings!.models.map(m=><span key={m.provider+m.id}>{m.provider} / {m.name||m.id}</span>)}</div></details>}
 </section>;
}

