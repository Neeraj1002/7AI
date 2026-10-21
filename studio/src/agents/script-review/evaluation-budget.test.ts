import { expect,it } from 'vitest';
import { callReservation,requireOfflineProof,COMPARISON_MODELS } from './evaluation-budget';
it('requires every offline check and exact source hash before permitting comparison',()=>{
 expect(()=>requireOfflineProof('a',{hash:'b',checks:{tests:true,typecheck:true,lint:true,build:true}})).toThrow();
 expect(()=>requireOfflineProof('a',{hash:'a',checks:{tests:true}})).toThrow();
 expect(()=>requireOfflineProof('a',{hash:'a',checks:{tests:true,typecheck:true,lint:true,build:true}})).not.toThrow();
});
it('includes historical spend and reserves before a primary or retry call',()=>{
 expect(callReservation(.937710,10000,4096,{inputPerMillionUsd:2,outputPerMillionUsd:10})).toBeCloseTo(.06096);
 expect(()=>callReservation(2.99,10000,8192,{inputPerMillionUsd:2,outputPerMillionUsd:10})).toThrow('ceiling');
 expect(COMPARISON_MODELS).toEqual(['claude-haiku-4-5','claude-sonnet-5-5']);
});
