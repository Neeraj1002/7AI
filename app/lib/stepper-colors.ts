// Sprint 5 Task 7 R11.4 — progress bar colours: done is a calm green, the current step is amber, a step the run failed
// on is red, a run the user stopped (cancelled, rejected) shows its stop in grey-dark, and what has not happened is grey.
import { color } from './theme';

export type StepperEnd = 'completed' | 'failed' | 'stopped';

export function barColors(currentIndex: number, count: number, end?: StepperEnd): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (end === 'completed') return color.okText;
    if (i < currentIndex) return color.okText;
    if (i === currentIndex) return end === 'failed' ? color.danger : end === 'stopped' ? color.muted : color.amber;
    return color.border;
  });
}
