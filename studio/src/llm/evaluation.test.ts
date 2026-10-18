import { expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>vi.fn());vi.mock('./client',()=>({callProviderModel:mock}));
import { callScriptReviewForEvaluation,resolvePurpose,resolvePricing } from './index';
it('compares only the requested reviewer models without rerouting any production purpose',async()=>{
 mock.mockResolvedValue({text:'{}',usage:{inputTokens:1,outputTokens:1},costUsd:'0.000012',stopReason:'stop'});
 const req={purpose:'script-review' as const,system:'s',messages:[],maxTokens:8192};await callScriptReviewForEvaluation(req,'claude-sonnet-5-5');expect(mock.mock.calls[0][0].model).toBe('claude-sonnet-5-5');expect(resolvePurpose('script-review').model).toBe('claude-haiku-4-5');expect(resolvePricing('claude-sonnet-5-5')).toEqual({inputPerMillionUsd:2,outputPerMillionUsd:10});
 await expect(callScriptReviewForEvaluation({...req,purpose:'intake-parsing'},'claude-sonnet-5-5')).rejects.toThrow('limited');
});
