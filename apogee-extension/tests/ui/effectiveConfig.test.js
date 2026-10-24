import test from "node:test";
import assert from "node:assert";

import { formatEffectiveConfigJSON } from "../../ui/effectiveConfig.js";
import { DEFAULT_SETTINGS } from "../../lib/constants.js";

test("JSON download carries redacted settings and default marks (#416)", () => {
  const parsed = JSON.parse(
    formatEffectiveConfigJSON(
      {
        ...DEFAULT_SETTINGS,
        responseFormat: "sentences",
        llamaApiKey: "sk-live-secret",
      },
      { version: "0.2.4", webgpu: "available" },
    ),
  );
  assert.equal(parsed.version, "0.2.4");
  assert.equal(parsed.webgpu, "available");
  assert.equal(parsed.settings.responseFormat, "sentences");
  assert.equal(parsed.settings.llamaApiKey, "set");
  assert.ok(!JSON.stringify(parsed).includes("sk-live-secret"));
  assert.ok(parsed.defaults.includes("summaryLanguage"));
  assert.ok(!parsed.defaults.includes("responseFormat"));
});
