/** Lexical number/currency normalization, bounded arithmetic and explicit numeric verdicts. */
export type NumberMention = { value: number; unit: string | null; text: string; index: number; end: number };
const names = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const values: Record<string, number> = Object.fromEntries(names.map((n, i) => [n, i]));
Object.assign(values, { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 });
const scales: Record<string, number> = { hundred:100, thousand:1000, million:1e6, billion:1e9 };
const atoms = [...Object.keys(values), ...Object.keys(scales), 'half', 'quarter', 'third', 'thirds', 'tenth'].join('|');
const quantity = '(?:\\d[\\d,]*(?:\\.\\d+)?(?:st|nd|rd|th|s)?|(?:'+atoms+'))(?:[ -]+(?:(?:and[ -]+)?(?:a[ -]+)?(?:'+atoms+')))*';
const numeric = new RegExp('\\b'+quantity+'\\b','gi');
export function valueOfNumber(raw: string): number {
  const text = raw.toLowerCase().replace(/,/g,'');
  const fraction = text.match(/^(one|two|a)[ -](half|thirds?|quarter|tenth)$/);
  if (fraction) return (fraction[1] === 'two' ? 2 : 1) / ({ half:2,third:3,thirds:3,quarter:4,tenth:10 }[fraction[2]] ?? 1);
  let total=0, group=0;
  for (const token of text.split(/[ -]+/)) {
    if (token==='and'||token==='a') continue;
    if (token==='half') group+=0.5;
    else if (token==='quarter') group+=0.25;
    else if (token==='third'||token==='thirds') group+=1/3;
    else if (token==='tenth') group+=0.1;
    else if (token==='hundred') group=(group||1)*100;
    else if (scales[token]) { total+=(group||1)*scales[token]; group=0; }
    else group+=values[token] ?? parseFloat(token);
  }
  return total+group;
}
export function numberMentions(text: string): NumberMention[] {
  const output: NumberMention[]=[];
  const occupied: [number,number][]=[];
  // A compound historical currency spelling is a single amount, not a novel standalone 2 and 6.
  const shillings = new RegExp('\\b('+quantity+')\\s*(?:shillings?|s)\\s*(?:and\\s+)?(sixpence|'+quantity+'\\s*(?:pence|pennies|d))\\b','gi');
  for (const m of text.matchAll(shillings)) {
    const pence=m[2].toLowerCase()==='sixpence'?6:valueOfNumber(m[2].replace(/\s*(pence|pennies|d)$/i,''));
    output.push({value:valueOfNumber(m[1])*12+pence,unit:'pence',text:m[0],index:m.index!,end:m.index!+m[0].length});
    occupied.push([m.index!,m.index!+m[0].length]);
  }
  for(const m of text.matchAll(/\b(penny and a half|sixpence)\b/gi)) if(!occupied.some(([a,b])=>m.index!>=a&&m.index!<b))
    { output.push({value:m[1].toLowerCase()==='sixpence'?6:1.5,unit:'pence',text:m[0],index:m.index!,end:m.index!+m[0].length}); occupied.push([m.index!,m.index!+m[0].length]); }
  for (const m of text.matchAll(numeric)) {
    const index=m.index!,end=index+m[0].length;
    if(occupied.some(([a,b])=>index>=a&&index<b))continue;
    const before=text.slice(Math.max(0,index-4),index), after=text.slice(end,end+22);
    let unit: string|null=null, value=valueOfNumber(m[0]);
    if (/\$\s*$/.test(before)||/^\s*(?:US\s+)?dollars?\b/i.test(after))unit='USD';
    else if (/^\s*cents?\b/i.test(after)){unit='USD';value/=100;}
    else if (/\u00a3\s*$/.test(before)||/^\s*pounds?\b/i.test(after))unit='GBP';
    else if (/^\s*(?:pence|pennies|penny)\b/i.test(after))unit='pence';
    output.push({value,unit,text:m[0],index,end});
  }
  for (const m of text.matchAll(/\b(?:a|an|per)\s+(?:pint|day|year|army[- ]measure)\b/gi)) if (!occupied.some(([a,b])=>m.index!>=a&&m.index!<b))
    output.push({value:1,unit:null,text:m[0],index:m.index!,end:m.index!+m[0].length});
  return output.sort((a,b)=>a.index-b.index);
}
export function sentenceSpans(text:string): {text:string; start:number; end:number}[] {
  const spans: {text:string;start:number;end:number}[]=[];let start=0;
  for(let i=0;i<text.length;i++)if(/[.!?]/.test(text[i])&&!(/\d/.test(text[i-1]??'')&&/\d/.test(text[i+1]??''))){spans.push({text:text.slice(start,i+1),start,end:i+1});start=i+1;}
  if(start<text.length)spans.push({text:text.slice(start),start,end:text.length});return spans;
}
const hedge=/\b(?:roughly|about|around|approximately|nearly|almost|estimated?|estimates|mostly|largely|at most|at least|more than|less than|over|up to|capped|maximum|minimum|ceiling|no more than|no less than)\b/i;
const same=(a:NumberMention,b:NumberMention)=>Math.abs(a.value-b.value)<1e-8&&(!a.unit||!b.unit||a.unit===b.unit);
function derived(n:NumberMention,source:NumberMention[],sentence:string):boolean{
  if(!/\b(per|each|total|times|half|third|quarter|tenth|double|sum|difference|divided|ratio)\b/i.test(sentence))return false;
  const values=[...new Set(source.map(m=>m.value))].filter(v=>v>0&&v<1e9).slice(0,50);
  return values.some(a=>values.some(b=>[a+b,a-b,a*b,a/b].some(v=>Math.abs(v-n.value)<1e-8)));
}
export function numericVerdicts(brief:string,script:string):{violations:string[];derivedHints:string[]}{
  const source=numberMentions(brief),candidates=numberMentions(script),violations:string[]=[],derivedHints:string[]=[];
  const sourceSpans=sentenceSpans(brief),scriptSpans=sentenceSpans(script);
  for(const n of candidates){
    const sentence=scriptSpans.find(s=>n.index>=s.start&&n.index<s.end)!.text.trim();
    const matches=source.filter(b=>same(n,b));
    if(!matches.length){
      if(derived(n,source,sentence))derivedHints.push(sentence);
      else violations.push('SR-1: unmatched number '+JSON.stringify(n.text)+(n.unit?' ('+n.unit+')':'')+' in '+JSON.stringify(sentence)+'; no normalized match in brief.');
      continue;
    }
    // If a value appears both hedged and unhedged in the brief, leave referent ambiguity to hints/model.
    const hedged=matches.every(m=>{const s=sourceSpans.find(s=>m.index>=s.start&&m.index<s.end)!;const previous=source.filter(p=>p.end<=m.index&&p.index>=s.start).at(-1);return hedge.test(brief.slice(Math.max(s.start,previous?.end??s.start,m.index-65),m.index));});
    if(hedged&&!hedge.test(sentence))violations.push('SR-8: dropped numeric hedge for '+JSON.stringify(n.text)+' in '+JSON.stringify(sentence)+'; matching brief number carries an approximation/limit hedge.');
  }
  return {violations:[...new Set(violations)],derivedHints:[...new Set(derivedHints)]};
}

export function numberFormattingEquivalent(brief:string,script:string,concern:string):boolean {
  const source=numberMentions(brief), target=numberMentions(script);
  const mentioned=numberMentions(concern.replace(/^\s*SR-[1-9][^:]*:/,''));
  return mentioned.length>=2&&mentioned.every(n=>same(n,mentioned[0]))&&
    mentioned.some(n=>/\d/.test(n.text))&&mentioned.some(n=>/[a-z]/i.test(n.text))&&
    source.some(n=>same(n,mentioned[0]))&&target.some(n=>same(n,mentioned[0]))&&
    !/unsupported|wrong (?:value|date)|different (?:value|date)/i.test(concern);
}
