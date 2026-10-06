import type { ChipTone } from './Chip';
import { humanize } from './format';

// Run and stage statuses come from the server as plain strings; unknown ones fall back
// to a neutral chip with the humanized text, so nothing is hidden.
export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'completed':
    case 'approved':
    case 'success':
      return 'ok';
    case 'failed':
    case 'error':
      return 'danger';
    case 'needs_attention':
    case 'paused_gate1':
    case 'paused_gate2':
    case 'skipped':
      return 'warn';
    case 'running':
    case 'in_progress':
      return 'accent';
    default:
      return 'neutral';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'paused_gate1':
      return 'Waiting at Gate 1';
    case 'paused_gate2':
      return 'Waiting at Gate 2';
    default:
      return humanize(status);
  }
}
