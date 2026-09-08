// Shared helper for the "prompt the model to return raw JSON" pattern used by
// both Intake parsing and Script Generation — pulls JSON text out of a
// response that may or may not be wrapped in a markdown code fence.
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}
