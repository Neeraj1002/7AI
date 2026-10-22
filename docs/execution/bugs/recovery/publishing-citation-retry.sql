-- Operator-run recovery for this one run, AFTER the citation fix is deployed.
-- This does not start a retry/upload, raise a budget or change an approval.
-- retryCount is restart-resume crash protection: leave it unchanged here.
-- Inspect first. A value of 3 below means three manual publishing retries USED.
SELECT id, status, "currentStage", "retryCount",
       "creationOptions" #> '{manualRetries,publishing}' AS publishing_retries_used
FROM public.pipeline_runs
WHERE id = '716a9a14-09b7-43ed-930a-ff8bc044c9fe';

-- Restore exactly ONE manual retry: used count 3 -> 2. All other JSON is retained.
-- If no row is returned, STOP: the expected state changed; inspect rather than widening this query.
UPDATE public.pipeline_runs AS run
SET "creationOptions" = jsonb_set("creationOptions", '{manualRetries,publishing}', '2'::jsonb, false),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE run.id = '716a9a14-09b7-43ed-930a-ff8bc044c9fe'
  AND run.status = 'needs_attention'
  AND run."currentStage" = 'publishing'
  AND run."creationOptions" #> '{manualRetries,publishing}' = '3'::jsonb
  AND run."publishingRecovery" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages AS stage
    WHERE stage."pipelineRunId" = run.id
      AND stage."stageName" = 'publishing'
      AND (stage.status = 'running' OR NULLIF(stage.output ->> 'youtubeVideoId', '') IS NOT NULL)
  )
RETURNING run.id, run.status, run."currentStage",
          run."creationOptions" #> '{manualRetries,publishing}' AS publishing_retries_used;

-- Close/reopen or refresh the run screen after a successful update. Waiting runs
-- are not continuously polled. Use the normal guarded Retry action; this SQL
-- does not bypass publishing receipt/legacy checks or guarantee a successful upload.
