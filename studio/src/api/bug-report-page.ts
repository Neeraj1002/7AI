// Testing-phase utility — see api/server.ts's /bugs routes. Inline CSS/JS,
// no build step, no framework, no auth: this is meant to be trivially
// disposable, matching the plan to remove or replace it once real testing
// winds down (see schema.prisma's BugReport comment).
export const BUG_REPORT_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>7AI — Report a Bug</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #f5f5f7; margin: 0; padding: 24px 16px; display: flex; justify-content: center; }
  main { width: 100%; max-width: 480px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  p.hint { color: #666; font-size: 14px; margin-top: 0; margin-bottom: 20px; }
  #context { font-size: 13px; color: #444; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 120px; padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; resize: vertical; font-family: inherit; }
  button { margin-top: 12px; width: 100%; padding: 14px; font-size: 16px; font-weight: 600; color: #fff; background: #2563eb; border: none; border-radius: 8px; cursor: pointer; }
  button:disabled { background: #93b4f0; cursor: default; }
  #status { margin-top: 12px; font-size: 14px; min-height: 20px; }
  #status.ok { color: #16803c; }
  #status.err { color: #c0392b; }
</style>
</head>
<body>
<main>
  <h1>Report a bug</h1>
  <p class="hint">Describe what happened — the more specific, the easier it is to fix (what you tapped, what you expected, what happened instead).</p>
  <div id="context"></div>
  <textarea id="description" placeholder="e.g. Tapped Approve on Gate 1, screen froze for ~10s then showed a blank Run Detail screen"></textarea>
  <button id="submit">Submit</button>
  <div id="status"></div>
</main>
<script>
  // Read-only, shown up front rather than hidden — a tester should be able
  // to see exactly what was captured (screen + run, if any) before
  // submitting, so something looking wrong is caught immediately, not
  // discovered later during triage.
  var queryParams = new URLSearchParams(window.location.search);
  var runId = queryParams.get('runId') || null;
  var screen = queryParams.get('screen') || null;
  var contextEl = document.getElementById('context');
  if (runId) {
    contextEl.textContent = 'Reporting from: Run Detail — run ' + runId;
  } else if (screen) {
    contextEl.textContent = 'Reporting from: ' + screen;
  } else {
    contextEl.textContent = 'No screen context captured — opened outside the app.';
  }

  var btn = document.getElementById('submit');
  var textarea = document.getElementById('description');
  var status = document.getElementById('status');
  btn.addEventListener('click', function () {
    var description = textarea.value.trim();
    if (!description) {
      status.textContent = 'Please describe the bug first.';
      status.className = 'err';
      return;
    }
    btn.disabled = true;
    status.textContent = 'Submitting…';
    status.className = '';
    fetch('/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description, runId: runId, screenContext: screen })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Server rejected the report');
        return res.json();
      })
      .then(function () {
        // Bugs Task 3 (R2) — redirecting here (rather than just clearing the
        // textarea/showing a status line) is what makes
        // WebBrowser.openAuthSessionAsync in ReportBugButton.tsx resolve and
        // auto-close the in-app browser: openAuthSessionAsync watches for a
        // navigation to its returnUrl, not for any DOM change on the page it
        // opened. Only the success path redirects — a failure below still
        // shows the red error text with the browser left open, so a real
        // failure stays visible for the tester to read and retry.
        window.location.href = 'sevenai://bugs-submitted';
      })
      .catch(function () {
        status.textContent = 'Something went wrong — try again.';
        status.className = 'err';
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
</script>
</body>
</html>`;
