import { numberMentions } from './numbers';
const words=(s:string)=>s.toLowerCase().match(/[a-z]+/g)??[];
const quoteClaims=(s:string)=>[...s.matchAll(/["\u201c]([^"\u201d]+)["\u201d]|(?<!\w)'([^'\n]+)'(?!\w)/g)].map(m=>m[1]??m[2]);
/** Explicit scene-prop policy only; never downgrade facts, names, numbers or factual dialogue. */
export function scenePropStatus(brief:string,script:string,finding:string):'listed'|'soft'|null {
 const policy=brief.match(/^SCENE PROPS:\s*([^\n.]+)\.[^\n]*/im);
 if(!/IMAGINED:/i.test(brief)||!policy||!/^SR-9\b/i.test(finding))return null;
 const body=finding.replace(/^SR-9(?:\s*\([^)]*\))?:\s*/i,'').split(/;\s*(?:use|say|replace|remove)|\.\s+(?:Use|Say|Replace|Remove)/)[0];
 if(!/\b(?:props?|weighing device|balance scale)\b/i.test(body))return null;
 if(/\b(?:numbers?|names?|named|dates?|prices?|rules?|beliefs?|rituals?|dialogue|quotations?|trade partners?|places?)\b/i.test(body)||numberMentions(body).length)return null;
 const claims=quoteClaims(body).filter(q=>script.toLowerCase().includes(q.toLowerCase()));
 if(!claims.length)return null;
 const common=new Set('The This That It I My An A Morning'.toLowerCase().split(' ')),source=new Set(words(brief));
 if(claims.some(q=>[...q.matchAll(/\b[A-Z][a-z]+\b/g)].some(m=>!common.has(m[0].toLowerCase())&&!source.has(m[0].toLowerCase()))))return null;
 const listed=policy[1].split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 const has=(q:string,p:string)=>(' '+q.toLowerCase().replace(/[^a-z]+/g,' ')+' ').includes(' '+p+' ');
 // Ambiguous combined claims remain soft findings; never dismiss an unverified extra object.
 return claims.every(q=>! /\b(?:and|or)\b/i.test(q)&&listed.some(p=>has(q,p)))?'listed':'soft';
}
