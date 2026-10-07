export type ReviewLog = {
  id: string;
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  stageId: string | null;

  agent: string; // agent name, or the literal string 'human'
  verdict: string; // "pass" | "fail" | "approve" | "edit" | "reject" | numeric score as text — no fixed set, see SCHEMA.md
  rationale: string;
  editedOutput: Record<string, unknown> | null;

  // Sprint 4 Task 4: the real user who resolved the gate; null if none.
  approvedByUserId: string | null;

  timestamp: Date;
};

export type CreateReviewLogInput = {
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  stageId?: string;
  agent: string;
  verdict: string;
  rationale: string;
  editedOutput?: Record<string, unknown>;
  approvedByUserId?: string | null;
};
