// The founder-notification / approval-gate interface. Every future call site
// (Script Review, Gate 1, Gate 2, Video Intelligence's own-draft gate) depends
// on this, never on a specific channel (e.g. Telegram) directly — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// Deliberately minimal for Week 2: "send the founder a message, optionally
// wait for and return a reply" — not the full Gate 1 UX (the three-reply-command
// grammar, per-run threading). This gets revised once Gate 1's actual
// requirements are known (MVP_ROADMAP_OCT15.md Section 17); treat this
// signature as provisional, not final.
export interface FounderChannel {
  notify(message: string): Promise<void>;
  requestApproval(message: string): Promise<{ reply: string }>;
}
