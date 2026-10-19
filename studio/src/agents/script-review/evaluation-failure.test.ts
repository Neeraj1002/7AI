import { expect,it } from 'vitest';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { reviewFailureEvidence } from './evaluation-failure';
it('does not infer cut-off or token usage from a generic historical stage error',()=>{
 const r=reviewFailureEvidence(new NonTransientStageError('discarded detail'),'claude-sonnet-5-5',4096);expect(r).toMatchObject({classification:'unknown',statusCode:null,stopReason:null,inputTokens:null,outputTokens:null,reasoningTokens:null});
});
it('retains real cut-off evidence and keeps the configured limit separate from usage',()=>{
 const r=reviewFailureEvidence(new NonTransientStageError('cut off',undefined,{stopReason:'length',inputTokens:100,outputTokens:4096,reasoningTokens:4000}),'claude-sonnet-5-5',4096);expect(r).toMatchObject({classification:'output-cutoff',stopReason:'length',outputTokens:4096,reasoningTokens:4000,maxTokens:4096});
});
it.each([[429,'rate_limit_error','workspace API usage limit','workspace-limit'],[529,'overloaded_error','overloaded','overload'],[400,'invalid_request_error','credit balance too low','provider-credit-limit']])('classifies HTTP %s without persisting credentials or provider bodies',(status,type,message,classification)=>{
 const secret='sk-ant-test-must-not-be-retained';const cause=Object.assign(new Error(secret),{statusCode:status,responseHeaders:{'request-id':'req_safe123','authorization':secret},responseBody:JSON.stringify({error:{type,message},secret})});
 const r=reviewFailureEvidence(new NonTransientStageError(secret,cause),'claude-sonnet-5-5',8192);expect(r).toMatchObject({statusCode:status,classification,requestId:'req_safe123'});expect(JSON.stringify(r)).not.toContain(secret);expect(r.outputTokens).toBeNull();
});
