// The founder-notification / approval-gate interface. Every future call site
// (Script Review, Gate 1, Gate 2, Video Intelligence's own-draft gate) depends
// on this, never on a specific channel (e.g. Telegram) directly — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// `requestApproval` takes a `threadKey` (Week 2 Task 6: Gate 1 passes the
// PipelineRun id) so an adapter can correlate a reply with the specific gate
// it belongs to — real per-run threading, not Task 2's original "the next
// message is the reply" placeholder, which stopped being safe the moment two
// gates could be pending at once (now true with Gate 1 built). The reply
// grammar itself (approve/reject[reason]/edited-text) lives in
// studio/src/agents/gate1/, not here — this interface only carries a
// message in and a raw reply string out.
export interface FounderChannel {
  notify(message: string): Promise<void>;
  requestApproval(params: { threadKey: string; message: string }): Promise<{ reply: string }>;
}
