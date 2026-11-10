export type Provider = 'openai'|'anthropic';
export type Mode = 'economy'|'balance'|'quality';
export type Model = {provider:Provider;id:string;name?:string;lifecycle?:string};
export type Usage = {input:number;output:number;total:number;cacheRead:number;cacheWrite:number;reasoning:number|null;billingComplete?:boolean};
export type Task = {id:string;role:string;task:string;provider:Provider;model:string;dependsOn:string[];status:'queued'|'running'|'completed'|'incomplete'|'error';output:string;usage:Usage|null;actualModel?:string;requestId?:string|null;error?:string;startedAt?:string;finishedAt?:string;stopReason?:string|null;cost?:TaskCost;estimatedReserveMicros?:number};
export type Run = {id:string;owner:string;title:string;prompt:string;mode:Mode;maxOutput:number;status:'draft'|'budget'|'ready'|'running'|'completed'|'error'|'cancelled';paused:boolean;createdAt:string;catalogue:Model[];tasks:Task[];leaseUntil?:number|null;uncertain?:boolean;budgetMicros?:number;pricingDate?:string;pricingVersion?:string;rates?:Record<string,PriceRate>;estimate?:Estimate;quoteExpiresAt?:number;availabilityVerified?:boolean;budgetStop?:string|null};
export type Settings = {openai:boolean;anthropic:boolean;vaultReady:boolean;models:Model[];errors:Partial<Record<Provider,string>>};
export type PriceRate={provider:Provider;id:string;input:number;output:number;cacheRead:number;cacheWrite:number;threshold:number;longInput:number;longOutput:number};
export type TaskCost={state:'reserved'|'settled'|'unknown';micros:number|null;reservedMicros:number;inputTokensReserved:number;rate:PriceRate;breakdown?:{input:number;output:number;total:number}};
export type Estimate={version:string;verifiedAt:string;lowMicros:number;highMicros:number;rows:{label:string;models:string[];lowMicros:number;highMicros:number}[]};

