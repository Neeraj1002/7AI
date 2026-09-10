// The founder-notification / approval-gate interface. Every future call site
// (Script Review, Gate 1, Gate 2, Video Intelligence's own-draft gate) depends
// on this, never on a specific channel (e.g. Telegram) directly — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// `requestApproval` takes a `threadKey` (Week 2 Task 6: Gate 1 passes the
// PipelineRun id) so an adapter can correlate a reply with the specific gate
// it belongs to — real per-run threading, not Task 2's original "the next
// message is the reply" placeholder, which stopped being safe the moment two
// gates could be pending at once (now true with Gate 1 built). Gate 2 (Week
// 3 Task 4) reuses the same `threadKey` (the run id) as Gate 1 for the same
// run — there's no separate "second thread" concept, both gates key off the
// same run. The reply grammar itself (approve/reject[reason]/edited-text or
// revision notes) lives in studio/src/agents/gate1//gate2/, not here — this
// interface only carries a message (optionally with a local file attachment)
// in and a raw reply string out.
export interface FounderChannel {
  notify(message: string): Promise<void>;
  requestApproval(params: {
    threadKey: string;
    message: string;
    attachmentPath?: string;
  }): Promise<{ reply: string }>;
  // Frontend track Task 1: a second caller (the API) resolving the same
  // pending gate a Telegram reply would otherwise resolve. Fulfills the same
  // underlying promise `requestApproval` is blocked on — whichever caller
  // (Telegram or this) arrives first wins; the other gets `resolved: false`
  // rather than double-resolving or silently overwriting the first decision.
  // Synchronous by design: the resolution itself is an in-memory map
  // check-and-delete with no I/O, so there's no `await` gap for a race to
  // land in between the check and the delete.
  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean };
}
