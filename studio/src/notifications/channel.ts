// The notification / approval-gate interface. Every call site (Script
// Review, Gate 1, Gate 2, Video Intelligence's own-draft gate) depends on
// this, never on a specific channel directly — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// Sprint 3 Task 7 (O5) — renamed from FounderChannel: this module stopped
// being about one hardcoded "the founder" recipient back in Task 3 (K2),
// which made composeFounderChannel fan out to an arbitrary list of real
// users; this rename just catches the vocabulary up to behavior that was
// already true.
//
// `requestApproval` takes a `threadKey` (Week 2 Task 6: Gate 1 passes the
// PipelineRun id) so an adapter can correlate a reply with the specific gate
// it belongs to. Gate 2 (Week 3 Task 4) reuses the same `threadKey` (the run
// id) as Gate 1 for the same run — there's no separate "second thread"
// concept, both gates key off the same run. The reply grammar itself
// (approve/reject[reason]/edited-text or revision notes) lives in
// studio/src/agents/gate1//gate2/, not here — this interface only carries a
// message in and a raw reply string out.
//
// Sprint 3 Task 7 (O2) — `attachmentPath` (a Gate 2 video file attachment)
// is gone from `requestApproval`'s params: it existed solely for the old
// bot channel's real "attach the video file" call, which no channel left
// in this system still does (the in-app channel never attached files — the
// dashboard reads the video directly from GET /runs/:id/video — and a push
// notification can't carry a video attachment either). Keeping an unused
// field on this interface once its one real consumer is deleted would be
// dead, misleading surface area, not a harmless leftover.
import type { PushDecision } from './resend-policy';

export interface NotificationChannel {
  // `meta.threadKey`, when given, is the same per-run id `requestApproval`
  // uses — lets a plain notify() (e.g. a gate reminder) still carry enough
  // identity for a push's `data` payload to deep-link to the right run, even
  // though notify() itself isn't an approval request. Digest notify() calls
  // (tenant-wide, no single run) simply omit it.
  notify(message: string, meta?: { threadKey?: string }): Promise<void>;
  // Bugs Task 12 (R6): `pushDecision` is computed once by the multi-channel before dispatch (a gate
  // re-sent after a restart must not stack identical pushes); absent means a normal first send.
  requestApproval(params: { threadKey: string; message: string; pushDecision?: PushDecision }): Promise<{ reply: string }>;
  // Set by per-recipient channels so the multi-channel can compute that recipient's decision.
  readonly recipientUserId?: string;
  // Frontend track Task 1: a second caller (the API) resolving the same
  // pending gate. Fulfills the same underlying promise `requestApproval` is
  // blocked on — whichever caller arrives first wins; the other gets
  // `resolved: false` rather than double-resolving or silently overwriting
  // the first decision. Synchronous by design: the resolution itself is an
  // in-memory map check-and-delete with no I/O, so there's no `await` gap
  // for a race to land in between the check and the delete.
  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean };
}
