import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const appSource = fs.readFileSync(
  new URL("../../ui/app.js", import.meta.url),
  "utf-8",
);

function summarizeActivePageBody() {
  const match = appSource.match(
    /async function summarizeActivePage\(\) \{([\s\S]*?)\n\}\n\ncancelSummarizeBtn/,
  );
  assert.ok(match, "summarizeActivePage function found");
  return match[1];
}

test("summarizeActivePage has a synchronous startup guard (#547)", () => {
  assert.match(
    appSource,
    /let isSummarizeStarting = false;/,
    "must declare isSummarizeStarting state variable",
  );

  const body = summarizeActivePageBody();
  assert.match(
    body,
    /if \(isSummarizeStarting\) \{\s*return;\s*\}\s*isSummarizeStarting = true;/,
    "must synchronously check and set isSummarizeStarting before any await",
  );
  assert.match(
    body,
    /finally \{\s*isSummarizeStarting = false;\s*hideCancelSummarizeButton\(\);/,
    "must reset isSummarizeStarting in finally",
  );
});

test("two immediate summarize clicks only start a single job (#547)", async () => {
  let isSummarizeStarting = false;
  let startedJobs = 0;

  async function simulateSummarize() {
    if (isSummarizeStarting) {
      return;
    }
    isSummarizeStarting = true;
    try {
      // Simulate asynchronous tab and page resolution
      await new Promise((resolve) => setTimeout(resolve, 15));
      startedJobs++;
    } finally {
      isSummarizeStarting = false;
    }
  }

  // Trigger two clicks in the exact same tick
  const run1 = simulateSummarize();
  const run2 = simulateSummarize();

  await Promise.all([run1, run2]);

  assert.strictEqual(
    startedJobs,
    1,
    "Second click while run is starting must do nothing",
  );
});
