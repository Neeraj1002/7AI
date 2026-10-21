import { groundModelFindings } from './grounded-findings';
import { expect,it,vi } from 'vitest';
import replays from '../../content-evidence/fixtures/sr-sonnet-round3-replays.json';
import strict from '../../content-evidence/fixtures/sr-strict-controls.json';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { checkBrief } from './brief-checks';
import { reviewScript as reviewAuditedScript } from './index';
import type { LLMResponse } from '../../llm';
it.each(replays.cases)('replays the immutable provider reply for $caseId / $repeat without a provider call',async c=>{
 const f=c.fixture;const complete=vi.fn().mockResolvedValue(c.response as LLMResponse);const result=await reviewScript({scriptText:f.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:f.videoKind as 'short'|'long',targetSeconds:f.targetSeconds,chapterTitles:f.chapterTitles,evidence:buildEvidencePacket({briefText:f.briefText,factPolicy:'brief-only'})},complete);expect(complete).toHaveBeenCalledTimes(1);expect(result.output).toEqual(groundModelFindings(c.output,f.briefText,f.scriptText));
});
it.each(strict.cases)('offline strict control $caseId fits length and adds no unmatched number/exact violation',c=>{
 const words=c.scriptText.trim().split(/\s+/).length,expected=c.targetSeconds*145/60;expect(words).toBeGreaterThanOrEqual(expected*.8);expect(words).toBeLessThanOrEqual(expected*1.2);const checks=checkBrief(c.briefText,c.scriptText);expect(checks.numericViolations).toEqual([]);expect(checks.exactViolations).toEqual([]);if(c.caseId.startsWith('d4-')){expect(c.scriptText).not.toMatch(/\bbalance\b/);expect(c.scriptText).toContain('1, 2, 4, 8, 16 and 32');}
});

// Frozen historical replies predate the private scoreAudit wire field.
const reviewScript: typeof reviewAuditedScript = (params, complete) => reviewAuditedScript(params, complete, { legacyReplay: true });
