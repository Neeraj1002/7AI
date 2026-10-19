import { expect,it } from 'vitest';
import { controlReservation, PRIOR_CONSERVATIVE_USD, PRIOR_RESERVATIONS_USD } from './evaluation-controls';
const pricing={inputPerMillionUsd:2,outputPerMillionUsd:10};
it('reserves full output and byte-bounded input against the separate approved ceiling',()=>{expect(controlReservation(0,20000,4096,pricing)).toBeCloseTo(.08096);expect(()=>controlReservation(1.45,20000,4096,pricing)).toThrow('$1.50');expect(PRIOR_CONSERVATIVE_USD).toBe(2.910662);expect(PRIOR_RESERVATIONS_USD).toBe(.219391);});
it.each([NaN,Infinity,-1])('fails closed on invalid ledger input %s',n=>expect(()=>controlReservation(n,1,1,pricing)).toThrow('Invalid'));
