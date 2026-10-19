/** Reviewer evaluation only: retain useful failure evidence without keys, headers or raw bodies. */
import { getStageErrorContext } from '../../run-pipeline/retry-with-backoff';
export function reviewFailureEvidence(error: unknown, model: string, maxTokens: number) {
 const outer=error instanceof Error?error:undefined;
 const context=getStageErrorContext(error)??{};
 const cause=(outer?.cause??outer) as {name?:string;statusCode?:number;finishReason?:string;rawFinishReason?:string;usage?:{inputTokens?:number;outputTokens?:number;outputTokenDetails?:{reasoningTokens?:number}};responseBody?:string;responseHeaders?:Record<string,string>;message?:string}|undefined;
 let providerError:{type?:string;message?:string}={};try{providerError=JSON.parse(cause?.responseBody??'{}').error??{};}catch{/* Never retain an unparsable body. */}
 const number=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0?n:null;
 const statusCode=number(context.statusCode??cause?.statusCode);
 const knownStops=['stop','end_turn','length','max_tokens','content-filter','refusal','error','unknown'];
 const stop=(s:unknown)=>typeof s==='string'&&knownStops.includes(s)?s:null;
 const stopReason=stop(context.stopReason??cause?.finishReason),rawStopReason=stop(context.rawStopReason??cause?.rawFinishReason);
 const message=String(context.providerErrorMessage??providerError.message??cause?.message??'');
 const classification=stopReason==='length'||stopReason==='max_tokens'||rawStopReason==='max_tokens'?'output-cutoff':context.recoveryKind==='provider_capacity'||/workspace api usage limit|workspace.*spend limit/i.test(message)?'workspace-limit':/credit balance|purchase credits/i.test(message)?'provider-credit-limit':providerError.type==='overloaded_error'||statusCode===529?'overload':statusCode===429?'rate-limit':cause?.name==='TimeoutError'||cause?.name==='AbortError'?'timeout':statusCode===401||statusCode===403?'authentication-or-permission':'unknown';
 const safeTypes=['overloaded_error','rate_limit_error','invalid_request_error','authentication_error','permission_error','api_error'];
 const requestId=cause?.responseHeaders?.['request-id'];
 return {model,maxTokens,errorClass:['Error','TransientStageError','NonTransientStageError','TimeoutError','AbortError','TypeError'].includes(outer?.name??'')?outer!.name:'UnknownError',statusCode,stopReason,rawStopReason,inputTokens:number(context.inputTokens??cause?.usage?.inputTokens),outputTokens:number(context.outputTokens??cause?.usage?.outputTokens),reasoningTokens:number(context.reasoningTokens??cause?.usage?.outputTokenDetails?.reasoningTokens),providerErrorType:safeTypes.includes(providerError.type??'')?providerError.type:null,requestId:requestId&&/^req_[A-Za-z0-9_-]{1,120}$/.test(requestId)?requestId:null,classification};
}
