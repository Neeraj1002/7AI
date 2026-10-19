import { expect,it,vi } from 'vitest';
import { diagnosticReservation,oneDiagnosticCall } from './evaluation-diagnostic';
const pricing={inputPerMillionUsd:2,outputPerMillionUsd:10};
it('enforces the separate diagnostic ceiling without dropping cumulative reservations',()=>{expect(diagnosticReservation(1.999582,0,30000,4096,pricing)).toBeCloseTo(.10096);expect(()=>diagnosticReservation(1.999582,.1,30000,4096,pricing)).toThrow('$0.15');expect(()=>diagnosticReservation(2.99,0,30000,4096,pricing)).toThrow('$3');});
it('a format retry cannot make a second diagnostic provider request',async()=>{const complete=vi.fn().mockResolvedValue({text:'{}'});const call=oneDiagnosticCall(complete);const req={purpose:'script-review' as const,system:'s',messages:[],maxTokens:4096};await call(req);await expect(call(req)).rejects.toThrow('one provider call');expect(complete).toHaveBeenCalledTimes(1);});
