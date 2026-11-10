'use client';
import {useState} from 'react';
import type {Settings} from '@/lib/kitchen-types';
import GitHubConnection from './GitHubConnection';
export default function Connections({settings,loading,refresh,save}:{settings:Settings|null;loading:boolean;refresh:()=>void;save:(keys:{openai:string;anthropic:string})=>Promise<void>}){
 const [keys,setKeys]=useState({openai:'',anthropic:''}),[busy,setBusy]=useState(false);
 return <section className="live-settings" aria-label="Model connections">
  <div><span className="ak-eyebrow">KITCHEN SUPPLIES</span><h2>Connect your chefs</h2><p>Connect directly to OpenAI and Anthropic. No extra software required.</p><p className="live-small">Keys are sent only to this private kitchen server and the corresponding provider. They are stored encrypted, never in your browser.</p></div>
  <details className="subscription-guide">
   <summary>Use API credits from your subscription</summary>
   <div className="subscription-guide-body">
    <p>Eligible plans include API credits you can use in this kitchen. Claim them with your provider first, then connect an API key below. Your chat usage allowance is separate.</p>
    <div className="subscription-providers">
     <article aria-labelledby="openai-credit-heading">
      <span className="ak-eyebrow">OPENAI</span><h3 id="openai-credit-heading">ChatGPT Pro or Business</h3>
      <p className="live-small">Paid plan active for at least 7 days. You must own the subscription or workspace and the API organization, using the same email for both accounts. Free, Go, Plus and Enterprise are not eligible.</p>
      <ol>
       <li>Open ChatGPT <a href="https://chatgpt.com/settings/billing" target="_blank" rel="noreferrer">Settings → Billing ↗</a>. For Business, use workspace billing.</li>
       <li>Find the API credits benefit, select your API organization and confirm activation.</li>
       <li>Create a <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">project API key ↗</a> in that organization. Paste it into OpenAI below.</li>
      </ol>
      <div className="subscription-links"><a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">Check credit balance ↗</a><a href="https://developers.openai.com/api/docs/guides/chatgpt-api-credits" target="_blank" rel="noreferrer">Official eligibility & setup ↗</a></div>
     </article>
     <article aria-labelledby="claude-credit-heading">
      <span className="ak-eyebrow">ANTHROPIC</span><h3 id="claude-credit-heading">Claude Max, Ultra or Team</h3>
      <p className="live-small">Active plan for at least 7 days. Claim as the subscriber or a Team owner; the Console organization requires Owner, Admin or Billing access. Free, Pro and Enterprise are not eligible.</p>
      <ol>
       <li>In a browser, open Claude <a href="https://claude.ai/settings/billing" target="_blank" rel="noreferrer">Settings → Billing ↗</a>. For Team, use Organization settings → Billing.</li>
       <li>Under API credits, choose Link organization. Select or create your Console organization, review the terms and confirm. Choose carefully: changing it requires support.</li>
       <li>Create an <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">API key ↗</a> in that organization. Paste it into Anthropic below.</li>
      </ol>
      <div className="subscription-links"><a href="https://platform.claude.com/settings/billing" target="_blank" rel="noreferrer">Check credit balance ↗</a><a href="https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ultra-and-team-plans" target="_blank" rel="noreferrer">Official eligibility & setup ↗</a></div>
     </article>
    </div>
    <p><strong>Then select Save and verify.</strong> Adding a key here does not claim credits or confirm your eligibility. If the benefit is missing, check the provider’s current eligibility and setup guide.</p>
    <p className="subscription-note"><strong>Keep spending predictable.</strong> Subscription credits expire and do not roll over. Once exhausted, usage may draw on paid credits or automatic top-ups. Check provider billing settings and set a kitchen budget before running.</p>
    <p className="live-small">Kitchen estimates and receipts show API usage value, not your remaining credit balance or the final amount charged after credits. This kitchen does not read your subscription or credit balance. Eligibility checked November 11, 2026; provider terms may change.</p>
   </div>
  </details>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save(keys);setKeys({openai:'',anthropic:''});}catch{/* Error is shown by the parent. */}finally{setBusy(false);}}}>
   {(['openai','anthropic'] as const).map(p=><label key={p}>{p==='openai'?'OpenAI':'Anthropic'} {settings?.[p]&&!settings.errors[p]?"· connected":''}<input type="password" autoComplete="off" value={keys[p]} onChange={e=>setKeys({...keys,[p]:e.target.value})} placeholder={settings?.[p]?"New replacement key":"API key"}/><a href={p==='openai'?'https://platform.openai.com/api-keys':'https://platform.claude.com/settings/keys'} target="_blank" rel="noreferrer">Get an API key ↗</a>{settings?.errors[p]&&<span className="live-error">{settings.errors[p]}</span>}</label>)}
   <div className="live-settings-actions"><button className="ak-main" disabled={busy||!settings?.vaultReady||(!keys.openai&&!keys.anthropic)}>{busy?"Checking…":"Save and verify"}</button><button className="ak-quiet" type="button" onClick={refresh} disabled={loading}>{loading?"Checking…":"Refresh connections"}</button></div>
   {!settings?.vaultReady&&<p className="live-small">{loading?"Checking server settings…":"Key storage is currently unavailable."}</p>}
  </form>
  {Boolean(settings?.models.length)&&<details className="live-catalog"><summary>Available models: {settings!.models.length}</summary><p className="live-small">This catalog comes from the providers. Text models can be assigned tasks; specialized models are listed for reference only.</p><div>{settings!.models.map(m=><span key={m.provider+m.id}>{m.provider} / {m.name||m.id}</span>)}</div></details>}
  <GitHubConnection/>
 </section>;
}

