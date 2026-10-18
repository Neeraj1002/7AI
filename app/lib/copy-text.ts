// Sprint 5 Task 7 R7 — "Copy script". The app has no clipboard module yet (expo-clipboard needs a new native build), so
// where the browser clipboard exists it is used, and on a phone the system share sheet opens, which has a Copy action.
import { Share } from 'react-native';

type ClipboardNav = { clipboard?: { writeText?: (t: string) => Promise<void> } };

export function hasDirectCopy(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as unknown as ClipboardNav).clipboard?.writeText === 'function';
}

/** Returns true when the text was copied straight to the clipboard, false when the share sheet was used. */
export async function copyText(text: string): Promise<boolean> {
  if (hasDirectCopy()) {
    await (navigator as unknown as ClipboardNav).clipboard!.writeText!(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
}
