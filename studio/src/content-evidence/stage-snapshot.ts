import { NonTransientStageError } from '../run-pipeline/retry-with-backoff';
import { assertEvidenceRef, buildEvidencePacket, validateEvidenceArguments, validateEvidencePacket,
  type EvidencePacket, type FactPolicy } from './packet';

export type EvidenceSelection = {
  evidence?: EvidencePacket;
  briefText?: string;
  factPolicy?: FactPolicy;
  sources?: string[];
  provenance: 'packet-v1' | 'legacy-generation-input' | 'legacy-input-incomplete';
};
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const policy = (value: unknown): FactPolicy | undefined =>
  value === 'brief-only' || value === 'brief-plus-common' ? value : undefined;
const citations = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(v => typeof v === 'string') ? value : undefined;

export function generationEvidenceSnapshot(params: {
  previousInput?: unknown;
  previousOutput?: unknown;
  briefText: string;
  factPolicy: FactPolicy;
  sources?: string[];
  videoKind?: 'short' | 'long';
}): EvidenceSelection {
  const previous = object(params.previousInput);
  if (previous) {
    if (previous.evidence !== undefined) {
      const evidence = validateEvidencePacket(previous.evidence);
      if ((previous.factPolicy !== undefined && !policy(previous.factPolicy))
        || (previous.sources !== undefined && !citations(previous.sources))) {
        throw new NonTransientStageError('Stored legacy evidence inputs have invalid types');
      }
      validateEvidenceArguments(evidence, { briefText: typeof previous.briefText === 'string' ? previous.briefText : undefined,
        factPolicy: policy(previous.factPolicy), sources: citations(previous.sources) });
      const output = object(params.previousOutput);
      if (output?.evidenceRef !== undefined) assertEvidenceRef(evidence, output.evidenceRef);
      return { evidence, briefText: evidence.briefText, factPolicy: evidence.factPolicy,
        sources: evidence.sources.map(s => s.citation), provenance: 'packet-v1' };
    }
    // A pre-v1 attempt cannot gain fictitious provenance on a retry. Use only
    // what that generation attempt actually stored, never today's channel defaults.
    const briefText = typeof previous.briefText === 'string' ? previous.briefText : undefined;
    const factPolicy = policy(previous.factPolicy);
    const sources = citations(previous.sources);
    return { briefText, factPolicy, sources,
      provenance: briefText && factPolicy && sources
        ? 'legacy-generation-input' : 'legacy-input-incomplete' };
  }
  const evidence = buildEvidencePacket({ briefText: params.briefText,
    factPolicy: params.videoKind === 'long' ? 'brief-only' : params.factPolicy, sources: params.sources });
  return { evidence, briefText: evidence.briefText, factPolicy: evidence.factPolicy,
    sources: evidence.sources.map(s => s.citation), provenance: 'packet-v1' };
}

export function reviewEvidenceSnapshot(generationInput: unknown, generationOutput: unknown): EvidenceSelection {
  const input = object(generationInput);
  const output = object(generationOutput);
  if (!input) {
    if (output?.evidenceRef !== undefined) throw new NonTransientStageError('Generation has an evidence reference but no stored packet');
    return { provenance: 'legacy-input-incomplete' };
  }
  if (input.evidence !== undefined) {
    const evidence = validateEvidencePacket(input.evidence);
    if ((input.factPolicy !== undefined && !policy(input.factPolicy))
      || (input.sources !== undefined && !citations(input.sources))) {
      throw new NonTransientStageError('Stored legacy evidence inputs have invalid types');
    }
    validateEvidenceArguments(evidence, { briefText: typeof input.briefText === 'string' ? input.briefText : undefined,
      factPolicy: policy(input.factPolicy), sources: citations(input.sources) });
    if (output?.evidenceRef !== undefined) assertEvidenceRef(evidence, output.evidenceRef);
    return { evidence, briefText: evidence.briefText, factPolicy: evidence.factPolicy,
      sources: evidence.sources.map(s => s.citation), provenance: 'packet-v1' };
  }
  if (output?.evidenceRef !== undefined) throw new NonTransientStageError('Generation has an evidence reference but no stored packet');
  const briefText = typeof input.briefText === 'string' ? input.briefText : undefined;
  const factPolicy = policy(input.factPolicy);
  const sources = citations(input.sources);
  return { briefText, factPolicy, sources,
    provenance: briefText && factPolicy && sources
      ? 'legacy-generation-input' : 'legacy-input-incomplete' };
}
