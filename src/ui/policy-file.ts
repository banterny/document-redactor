export const POLICY_SCHEMA_VERSION = 1;
export const POLICY_FILE_MAX_BYTES = 256 * 1024;
export const POLICY_MAX_ENTRIES = 500;
export const POLICY_MAX_TEXT_LENGTH = 200;
export const POLICY_MAX_NAME_LENGTH = 120;

export const POLICY_CATEGORIES = [
  "literals",
  "financial",
  "temporal",
  "entities",
  "legal",
  "other",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export interface PolicyEntry {
  readonly text: string;
  readonly category: PolicyCategory;
  readonly defaultSelected: boolean;
}

export interface PolicyFile {
  readonly schemaVersion: typeof POLICY_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly name: string;
  readonly entries: readonly PolicyEntry[];
}

export class PolicyFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyFileError";
  }
}

const CATEGORY_SET: ReadonlySet<string> = new Set(POLICY_CATEGORIES);

export function createPolicyFile(
  entries: readonly PolicyEntry[],
  opts: {
    readonly name?: string;
    readonly createdAt?: string;
  } = {},
): PolicyFile {
  return validatePolicyFile({
    schemaVersion: POLICY_SCHEMA_VERSION,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    name: opts.name ?? "Document redaction policy",
    entries,
  });
}

export function serializePolicyFile(policy: PolicyFile): string {
  return `${JSON.stringify(validatePolicyFile(policy), null, 2)}\n`;
}

export function parsePolicyFileJson(json: string): PolicyFile {
  if (json.length > POLICY_FILE_MAX_BYTES) {
    throw new PolicyFileError("Policy file is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PolicyFileError("Policy file is not valid JSON.");
  }

  return validatePolicyFile(parsed);
}

export function validatePolicyFile(value: unknown): PolicyFile {
  if (!isRecord(value)) {
    throw new PolicyFileError("Policy file must be a JSON object.");
  }
  if (value.schemaVersion !== POLICY_SCHEMA_VERSION) {
    throw new PolicyFileError("Unsupported policy schema version.");
  }
  const createdAt = requireString(value.createdAt, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new PolicyFileError("Policy createdAt must be an ISO date string.");
  }
  const name = requireString(value.name, "name").trim();
  if (name.length === 0 || name.length > POLICY_MAX_NAME_LENGTH) {
    throw new PolicyFileError("Policy name must be 1-120 characters.");
  }
  if (!Array.isArray(value.entries)) {
    throw new PolicyFileError("Policy entries must be an array.");
  }
  if (value.entries.length > POLICY_MAX_ENTRIES) {
    throw new PolicyFileError("Policy has too many entries.");
  }

  const entriesByKey = new Map<string, PolicyEntry>();
  for (const rawEntry of value.entries) {
    const entry = validateEntry(rawEntry);
    entriesByKey.set(policyEntryKey(entry), entry);
  }

  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    createdAt,
    name,
    entries: [...entriesByKey.values()],
  };
}

export function policyEntryKey(entry: Pick<PolicyEntry, "category" | "text">): string {
  return `${entry.category}\u0000${entry.text}`;
}

function validateEntry(value: unknown): PolicyEntry {
  if (!isRecord(value)) {
    throw new PolicyFileError("Each policy entry must be an object.");
  }
  const text = requireString(value.text, "entry.text").trim();
  if (text.length === 0 || text.length > POLICY_MAX_TEXT_LENGTH) {
    throw new PolicyFileError("Policy entry text must be 1-200 characters.");
  }
  const category = requireString(value.category, "entry.category");
  if (!CATEGORY_SET.has(category)) {
    throw new PolicyFileError(`Unsupported policy category: ${category}`);
  }
  if (typeof value.defaultSelected !== "boolean") {
    throw new PolicyFileError("Policy entry defaultSelected must be boolean.");
  }

  return {
    text,
    category: category as PolicyCategory,
    defaultSelected: value.defaultSelected,
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new PolicyFileError(`Policy ${fieldName} must be a string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
