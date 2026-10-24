// Sprint 5 Task 7 R7 — "Copy script" puts the text on the clipboard (expo-clipboard).
//
// expo-clipboard is a native module. A phone still running an older build has no such module, and importing it there
// throws when the module loads; that would take the whole Run screen down on an over-the-air update. So it is loaded on
// first use, and if it is not there the system share sheet (which has a Copy action) is used instead.
import { Share } from 'react-native';

/** True when the text went straight to the clipboard, false when the share sheet had to be used. */
export async function copyText(text: string): Promise<boolean> {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    await Share.share({ message: text });
    return false;
  }
}
