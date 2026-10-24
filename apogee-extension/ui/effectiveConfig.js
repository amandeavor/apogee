import { getRedactedSettings } from "../lib/util/diagnostics.js";

// Redacted config for attaching to a bug report without copying
// settings by hand.
export function formatEffectiveConfigJSON(settings, extra = {}) {
  const entries = getRedactedSettings(settings);
  return JSON.stringify(
    {
      ...extra,
      settings: Object.fromEntries(
        entries.map(({ key, value }) => [key, value]),
      ),
      defaults: entries
        .filter(({ isDefault }) => isDefault)
        .map(({ key }) => key),
    },
    null,
    2,
  );
}
