export { anglesSystem, pairReaderSystem, coldReaderSystem, promiseMatchSystem } from '../prompts/system-prompts';

export type VideoFormat = 'short' | 'long';

export function anglesUser(topic: string, constraints: string[]): string {
  return `<subject>${topic}</subject>\n<constraints>${constraints.join('\n')}</constraints>`;
}

export function pairReaderUser(items: Array<{ id: string; title: string; promise: string }>): string {
  return items.map((i) => `${i.id}. ${i.title}\n   ${i.promise}`).join('\n\n');
}

export function coldReaderUser(scriptText: string): string {
  return `<script>\n${scriptText}\n</script>`;
}

export function promiseMatchUser(promise: string, about: string, remembered: string): string {
  return `<promise>${promise}</promise>\n<about>${about}</about>\n<remembered>${remembered}</remembered>`;
}
