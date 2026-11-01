-- Retire Channel.styleGuide and Channel.defaultVoice. The channel's active content profile owns the script guide
-- (script.guide) and the default voice (audio.defaultVoice). Irreversible: take a pg_dump backup before deploying.
ALTER TABLE "channels" DROP COLUMN "styleGuide";
ALTER TABLE "channels" DROP COLUMN "defaultVoice";
