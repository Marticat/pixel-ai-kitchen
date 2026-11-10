export type Provider = 'openai'|'anthropic';
export type Mode = 'economy'|'balance'|'quality';
export type Model = {provider:Provider;id:string;name?:string;lifecycle?:string};
export type Usage = {input:number;output:number;total:number;cacheRead:number;cacheWrite:number;reasoning:number|null;billingComplete?:boolean};
export type Task = {id:string;role:string;task:string;provider:Provider;model:string;dependsOn:string[];status:'queued'|'running'|'completed'|'incomplete'|'error';output:string;usage:Usage|null;actualModel?:string;requestId?:string|null;error?:string;startedAt?:string;finishedAt?:string;stopReason?:string|null;cost?:TaskCost;estimatedReserveMicros?:number;kind?:'work'|'review';revision?:number;attempts?:Task[];feedback?:string;operation?:'repair'|'escalate';stale?:boolean;targetId?:string;targetRevision?:number;review?:{passed:boolean;issues:string[];revision:number;checkedAt?:string};context?:ContextReport;preparedInput?:TaskInput;approvedReserveMicros?:number};
export type ContextReport={sources:{id:string;role:string;originalChars:number;includedChars:number;trimmed:boolean}[];originalChars:number;includedChars:number};
export type TaskInput={provider:Provider;model:string;system:string;prompt:string;maxOutput:number;context:ContextReport};
export type ActionQuote={id:string;action:'repair'|'escalate'|'review'|'refresh';taskId:string;targetRevision:number;task:Task;feedback:string;previousModel:string;input:TaskInput;reserveMicros:number;expiresAt:number};
export type Run = {id:string;owner:string;title:string;prompt:string;mode:Mode;maxOutput:number;status:'draft'|'budget'|'ready'|'running'|'completed'|'error'|'cancelled';paused:boolean;createdAt:string;catalogue:Model[];tasks:Task[];leaseUntil?:number|null;uncertain?:boolean;budgetMicros?:number;pricingDate?:string;pricingVersion?:string;rates?:Record<string,PriceRate>;estimate?:Estimate;quoteExpiresAt?:number;availabilityVerified?:boolean;budgetStop?:string|null;workMode?:'auto'|'single';actionQuote?:ActionQuote;pendingTaskId?:string};
export type Settings = {openai:boolean;anthropic:boolean;vaultReady:boolean;models:Model[];errors:Partial<Record<Provider,string>>};
export type PriceRate={provider:Provider;id:string;input:number;output:number;cacheRead:number;cacheWrite:number;threshold:number;longInput:number;longOutput:number};
export type TaskCost={state:'reserved'|'settled'|'unknown';micros:number|null;reservedMicros:number;inputTokensReserved:number;rate:PriceRate;breakdown?:{input:number;output:number;total:number}};
export type Estimate={version:string;verifiedAt:string;lowMicros:number;highMicros:number;rows:{label:string;models:string[];lowMicros:number;highMicros:number}[]};

