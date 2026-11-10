export type Provider = 'openai'|'anthropic';
export type Mode = 'economy'|'balance'|'quality';
export type Model = {provider:Provider;id:string;name?:string;lifecycle?:string};
export type Usage = {input:number;output:number;total:number;cacheRead:number;cacheWrite:number;reasoning:number|null};
export type Task = {id:string;role:string;task:string;provider:Provider;model:string;dependsOn:string[];status:'queued'|'running'|'completed'|'incomplete'|'error';output:string;usage:Usage|null;actualModel?:string;requestId?:string|null;error?:string;startedAt?:string;finishedAt?:string;stopReason?:string|null};
export type Run = {id:string;owner:string;title:string;prompt:string;mode:Mode;maxOutput:number;status:'ready'|'running'|'completed'|'error'|'cancelled';paused:boolean;createdAt:string;catalogue:Model[];tasks:Task[];leaseUntil?:number|null;uncertain?:boolean};
export type Settings = {openai:boolean;anthropic:boolean;vaultReady:boolean;models:Model[];errors:Partial<Record<Provider,string>>};
