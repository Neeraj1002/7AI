export { THUMBNAIL_DEFECT_SYSTEM_PROMPT as DEFECT_SYSTEM, THUMBNAIL_CRITIC_SYSTEM_PROMPT as CRITIC_SYSTEM, THUMBNAIL_PAYOFF_SYSTEM_PROMPT as PAYOFF_SYSTEM, THUMBNAIL_COMPARE_SYSTEM_PROMPT as COMPARE_SYSTEM } from '../prompts/system-prompts';
export const defectUser = (): string => 'Inspect this picture and give the boxes.';

export const criticUser = (title: string): string => `Title: ${title}\n\nAnswer as the stranger you are.`;

export function payoffUser(p: { renderedScript: string; title: string; lettering: string; question: string; answeredAtQuote: string; unnamedProps?: string[] }): string {
  const hint = p.unnamedProps && p.unnamedProps.length > 0 ? `
The concept for this picture lists these objects, which the script does not name; look for them especially: ${p.unnamedProps.join(', ')}.
` : '';
  return `${hint}Title: ${p.title}\nWords on the thumbnail: ${p.lettering}\nThe question this package raises: ${p.question}\nPlace the script is said to answer it: "${p.answeredAtQuote}"\n\nThe approved script:\n"""\n${p.renderedScript}\n"""\n\nThe thumbnail picture is attached.`;
}

export const compareUser = (titleA: string, titleB: string): string => `A title: ${titleA}\nB title: ${titleB}\n\nImage 1 is A, image 2 is B. Which would you click?`;
