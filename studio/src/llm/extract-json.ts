// Shared helper for the "prompt the model to return raw JSON" pattern used by
// both Intake parsing and Script Generation — pulls JSON text out of a
// response that may or may not be wrapped in a markdown code fence.
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

// Bugs Task 11 (R5) — a tolerant variant for the one call site whose reply is
// long free text inside a JSON string (Script Generation). Mechanical repairs
// only, none of which can change what the model said:
//   1. strip a markdown code fence (same rule as extractJsonText), including
//      an unclosed one on a reply cut off at the output cap;
//   2. take the outermost {...}, dropping any prose before or after it;
//   3. escape raw newlines, carriage returns, tabs and other control
//      characters that sit inside a string value, which JSON.parse rejects.
// Deliberately NOT done: guessing which double quote inside a string was meant
// to be escaped. That is a judgement about the model's intent; a reply with a
// stray quote stays unparseable and goes to the retry (which tells the model).
export function extractJsonObjectText(raw: string): string {
  const unfenced = extractJsonText(raw)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const body = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  return escapeControlCharsInStrings(body);
}

function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += ch;
    } else if (ch === '\\') {
      escaped = true;
      out += ch;
    } else if (ch === '"') {
      inString = false;
      out += ch;
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      out += '\\r';
    } else if (ch === '\t') {
      out += '\\t';
    } else if (ch.charCodeAt(0) < 0x20) {
      out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out;
}

// Bugs Task 11 (PR #55) — what to say about a JSON.parse failure WITHOUT quoting
// the reply. The error message ends up in pipeline_runs.lastError and
// pipeline_stages.error, which the admin run inspector and the tenant run view
// both return, so it must not carry model output. Node's own message can: it
// names the offending character and, for short input, quotes the whole text.
// Keep the generic wording and the position, drop everything quoted.
export function describeJsonError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)(?: \(line (\d+) column (\d+)\))?/.exec(message);
  const generic = message
    .replace(/,?\s*"[\s\S]*"\s*is not valid JSON/, '')
    .replace(/ in JSON at position[\s\S]*$/, '')
    .replace(/ after JSON at position[\s\S]*$/, ' after JSON')
    .replace(/token '[\s\S]*?'/, 'token')
    .trim();
  const where = position ? ` at position ${position[1]}${position[2] ? ` (line ${position[2]} column ${position[3]})` : ''}` : '';
  return `${generic || 'invalid JSON'}${where}`;
}
