-- Sprint 6 Task 3 (P19, decision 8): a run waits at 'paused_angle' between intake and the script step while the
-- founder picks an angle. One line of SQL: the status check gains one value. No table or column changes.
ALTER TABLE "pipeline_runs" DROP CONSTRAINT "pipeline_runs_status_check";
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_status_check"
  CHECK ("status" IN ('pending', 'running', 'paused_angle', 'paused_gate1', 'paused_gate2', 'completed', 'failed', 'needs_attention'));
