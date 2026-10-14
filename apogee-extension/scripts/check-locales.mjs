import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_LOCALE = "en";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err.message}`, { cause: err });
  }
}

function messageOf(catalog, key) {
  const entry = catalog?.[key];
  return typeof entry?.message === "string" ? entry.message : undefined;
}

function checkDefaultCatalog(defaults) {
  const errors = [];
  const keys = Object.keys(defaults);
  if (keys.length === 0) {
    errors.push(`default locale "${DEFAULT_LOCALE}" defines no keys`);
  }
  for (const key of keys) {
    if (!messageOf(defaults, key)) {
      errors.push(
        `default locale "${DEFAULT_LOCALE}" key "${key}" must have a non-empty message string`,
      );
    }
  }
  return { errors, keys };
}

function checkLocaleCatalog(code, catalog, defaultKeys) {
  const errors = [];
  const warnings = [];
  const missing = defaultKeys.filter((key) => !messageOf(catalog, key));
  if (missing.length > 0) {
    errors.push(
      `locale "${code}" is missing ${missing.length} default-locale key(s): ${missing.join(", ")}`,
    );
  }
  const extra = Object.keys(catalog).filter(
    (key) => !defaultKeys.includes(key),
  );
  if (extra.length > 0) {
    warnings.push(
      `locale "${code}" defines ${extra.length} key(s) absent from the default locale: ${extra.join(", ")}`,
    );
  }
  return { errors, warnings };
}

function checkGlossaryShape(glossary) {
  const errors = [];
  if (!glossary || typeof glossary !== "object" || Array.isArray(glossary)) {
    return { errors: ["glossary must be a JSON object with a terms array"] };
  }
  if (!Array.isArray(glossary.terms) || glossary.terms.length === 0) {
    errors.push("glossary must define a non-empty terms array");
    return { errors };
  }
  const seen = new Set();
  for (const term of glossary.terms) {
    if (!term || typeof term !== "object") {
      errors.push("glossary terms must be objects");
      continue;
    }
    if (typeof term.id !== "string" || term.id.length === 0) {
      errors.push("glossary terms must have a non-empty string id");
      continue;
    }
    if (seen.has(term.id)) {
      errors.push(`glossary term "${term.id}" is defined more than once`);
    }
    seen.add(term.id);
    if (typeof term.en !== "string" || term.en.length === 0) {
      errors.push(
        `glossary term "${term.id}" must have a non-empty canonical "en" text`,
      );
    }
    if (
      !Array.isArray(term.keys) ||
      term.keys.length === 0 ||
      term.keys.some((key) => typeof key !== "string" || key.length === 0)
    ) {
      errors.push(
        `glossary term "${term.id}" must list a non-empty array of catalog key strings`,
      );
    }
  }
  return { errors };
}

function checkGlossaryTerms(glossary, defaults, catalogs) {
  const errors = [];
  for (const term of glossary.terms) {
    if (!term || typeof term !== "object") continue;
    const unknown = (term.keys || []).filter((key) => !(key in defaults));
    if (unknown.length > 0) {
      errors.push(
        `glossary term "${term.id}" lists unknown default-locale key(s): ${unknown.join(", ")}`,
      );
    }
    const known = (term.keys || []).filter((key) => key in defaults);
    const enTexts = new Map(
      known.map((key) => [key, messageOf(defaults, key)]),
    );
    if (![...enTexts.values()].every((text) => text === term.en)) {
      const detail = [...enTexts]
        .map(([key, text]) => `${key}=${JSON.stringify(text)}`)
        .join(", ");
      errors.push(
        `glossary term "${term.id}" drifts in the default locale (expected ${JSON.stringify(term.en)}): ${detail}`,
      );
    }
    for (const [code, catalog] of Object.entries(catalogs)) {
      const present = known.filter((key) => messageOf(catalog, key));
      const renderings = new Set(present.map((key) => catalog[key].message));
      if (renderings.size > 1) {
        const detail = present
          .map((key) => `${key}=${JSON.stringify(catalog[key].message)}`)
          .join(", ");
        errors.push(
          `glossary term "${term.id}" drifts in locale "${code}" (one shared rendering per term): ${detail}`,
        );
      }
    }
  }
  return { errors };
}

export function checkCatalogs(localesDir, glossary) {
  const errors = [];
  const warnings = [];
  let entries;
  try {
    entries = readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    return { errors: [`Cannot list ${localesDir}: ${err.message}`], warnings };
  }
  if (!entries.includes(DEFAULT_LOCALE)) {
    errors.push(
      `default locale "${DEFAULT_LOCALE}" is missing from ${localesDir}`,
    );
    return { errors, warnings };
  }
  const defaults = readJson(
    resolve(localesDir, DEFAULT_LOCALE, "messages.json"),
  );
  const defaultCheck = checkDefaultCatalog(defaults);
  errors.push(...defaultCheck.errors);

  const catalogs = {};
  for (const code of entries) {
    if (code === DEFAULT_LOCALE) continue;
    const catalog = readJson(resolve(localesDir, code, "messages.json"));
    catalogs[code] = catalog;
    const result = checkLocaleCatalog(code, catalog, defaultCheck.keys);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const shape = checkGlossaryShape(glossary);
  errors.push(...shape.errors);
  if (shape.errors.length === 0) {
    errors.push(...checkGlossaryTerms(glossary, defaults, catalogs).errors);
  }
  return { errors, warnings };
}

function main() {
  const localesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "_locales",
  );
  let glossary;
  try {
    glossary = readJson(resolve(localesDir, "glossary.json"));
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
  let result;
  try {
    result = checkCatalogs(localesDir, glossary);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
  for (const warning of result.warnings) console.log(`::warning::${warning}`);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`::error::${error}`);
    console.error(
      `locale catalog check failed with ${result.errors.length} error(s)`,
    );
    process.exit(1);
  }
  console.log("locale catalogs OK: every locale defines every default key");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
