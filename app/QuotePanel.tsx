'use client';
import {useEffect,useState} from 'react';
import type {Run} from '@/lib/kitchen-types';
import {money} from './kitchen-client';
import {PRICE_SOURCES} from '@/lib/kitchen-money.mjs';
export default function QuotePanel({quote,busy,connected,start,connect}:{quote:Run;busy:boolean;connected:boolean;start:()=>void;connect:()=>void}){
 const [clock,setClock]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const e=quote.estimate!,expired=clock>(quote.quoteExpiresAt||0),over=e.highMicros>quote.budgetMicros!;
 return <section className="money-quote" aria-label="Pre-launch estimate">
  <div className="money-heading"><div><span className="ak-eyebrow">ESTIMATE · FREE CALCULATION</span><h2>{money(e.lowMicros)} – {money(e.highMicros)}</h2><p className="live-small">{quote.workMode==='single'?"One chef will handle the request directly. There is no separate planning call.":"The head chef will solve a small task or assign 1–5 workers. The team is decided after the first response."}</p></div><div className="money-limit"><span>Your budget</span><strong>{money(quote.budgetMicros!)}</strong><span>USD for the whole order</span></div></div>
  <div className="money-table-wrap"><table className="money-table"><thead><tr><th>Stage</th><th>Models</th><th>Estimate, USD</th></tr></thead><tbody>{e.rows.map(row=><tr key={row.label}><td>{row.label}</td><td>{row.models.join(', ')}</td><td>{money(row.lowMicros)} – {money(row.highMicros)}</td></tr>)}</tbody></table></div>
  {over&&<p className="money-warning">Your budget is below the upper estimate. Work may stop before all tasks finish. Increase the budget or choose Economy.</p>}
  {!quote.availabilityVerified&&<p className="live-small">This estimate uses the pricing catalog. Model availability will be checked after you connect API keys. A different model selection requires a new estimate.</p>}
  <details className="live-small"><summary>How pricing works</summary><p>This is a range of scenarios, not a guaranteed price: response lengths and team size are not yet known. Before each call, input tokens are checked and the maximum response cost is reserved with a margin. Unknown costs stop further calls.</p><p>Standard USD rates, verified on {e.verifiedAt}. Excludes taxes, account top-ups and spending outside this order. The provider determines the final bill. Models without verified rates are not assigned.</p><p><a href={PRICE_SOURCES.openai} target="_blank" rel="noreferrer">OpenAI pricing ↗</a> · <a href={PRICE_SOURCES.anthropic} target="_blank" rel="noreferrer">Anthropic pricing ↗</a></p></details>
  <div className="money-actions"><button className="ak-main" disabled={busy||!connected||expired} onClick={start}>{busy?"Starting…":"Start · budget "+money(quote.budgetMicros!)}</button>{!connected&&<button className="ak-quiet" onClick={connect}>Connect models</button>}<span className="live-small">{expired?"Estimate expired — calculate it again.":"No paid calls are made until you click Start."}</span></div>
 </section>;
}
