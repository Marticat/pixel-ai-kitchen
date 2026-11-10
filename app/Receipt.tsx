'use client';
import type {Run} from '@/lib/kitchen-types';
import {ledger,receiptRows} from '@/lib/kitchen-money.mjs';
import {exportReceipt,fmt,money} from './kitchen-client';
export default function Receipt({run}:{run:Run}){
 const rows=receiptRows(run),funds=ledger(run),categories=["Planning","Creation","Review","Revision","Escalation"];
 return <section className="receipt" aria-label="Order receipt"><div className="money-heading"><div><span className="ak-eyebrow">ORDER RECEIPT · USD</span><h2>{money(funds.spent)}</h2><p className="live-small">Based on reported tokens. Includes every version and review.</p></div><button className="ak-quiet" onClick={()=>exportReceipt(run)}>Download receipt .csv</button></div>
  <div className="receipt-categories">{categories.map(category=><div key={category}><span>{category}</span><strong>{money(rows.filter(r=>r.category===category&&r.cost?.state==='settled').reduce((n,r)=>n+(r.cost?.micros||0),0))}</strong></div>)}</div>
  <div className="money-table-wrap"><table className="money-table"><thead><tr><th>Chef / version</th><th>Model and work</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.taskId+'-'+i}><td>{row.role}<small>Version {row.revision+1}</small></td><td>{row.actualModel||row.model}<small>{row.category}</small></td><td>{row.usage?fmt(row.usage.total):"No data"}</td><td>{row.cost?.state==='settled'?money(row.cost.micros!):"Unknown"}{row.cost&&row.cost.state!=='settled'&&<small>Reserved {money(row.cost.reservedMicros)}</small>}</td></tr>)}</tbody></table>{!rows.length&&<p className="live-small">No paid requests yet. Every attempt will appear here.</p>}</div>
  <p className="live-small">Rates verified on {run.pricingDate}. This is an API cost calculation, not a provider invoice. The reserve of {money(funds.reserved)}  is tracked separately. Savings percentages require a verified comparison.</p>
 </section>;
}
