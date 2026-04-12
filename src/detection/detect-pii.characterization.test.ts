import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  buildTargetsFromZip,
  detectPii,
  detectPiiInZip,
} from "./detect-pii.js";
import { normalizeForMatching } from "./normalize.js";
import { PII_KINDS, PII_PATTERNS, type PiiKind } from "./patterns.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

/**
 * Authoritative mapping from legacy PiiKind to ported rule subcategory.
 * This is the single source of truth for the Phase 0 migration: any shim
 * that exposes a KIND_TO_SUBCATEGORY mapping MUST agree with this one
 * (T2 verifies the agreement).
 */
const EXPECTED_KIND_TO_SUBCATEGORY: Record<PiiKind, string> = {
  rrn: "korean-rrn",
  brn: "korean-brn",
  ein: "us-ein",
  "phone-kr": "phone-kr",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  card: "credit-card",
};

/**
 * Regex source parity table. Each entry is the exact legacy pattern's
 * `.source` string. The ported rule's pattern.source MUST equal this.
 */
const EXPECTED_REGEX_SOURCE: Record<PiiKind, string> = {
  rrn: "(?<!\\d)\\d{6}-[1-8]\\d{6}(?!\\d)",
  brn: "(?<!\\d)\\d{3}-\\d{2}-\\d{5}(?!\\d)",
  ein: "(?<!\\d)\\d{2}-\\d{7}(?!\\d)",
  "phone-kr": "(?<!\\d)01[016-9]-?\\d{3,4}-?\\d{4}(?!\\d)",
  "phone-intl": "(?<![\\w+])\\+\\d{1,3}(?:[\\s-]\\d{1,4}){2,4}(?!\\d)",
  email: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b",
  "account-kr": "(?<!\\d)\\d{3,6}-\\d{2,3}-\\d{4,7}(?!\\d)",
  card: "(?<![\\d-])\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}(?![\\d-])",
};

describe("T1: detectPii mixed-kind output order is PII_KINDS-major", () => {
  it("preserves kind-major ordering, not global document order", () => {
    // Email appears FIRST textually, but PII_KINDS iterates brn → phone-kr →
    // email, so the output order must be brn, phone-kr, email.
    const input = "email kim@abc.kr phone 010-1234-5678 tax 123-45-67890";
    const kinds = detectPii(input).map((m) => m.kind);
    // brn before phone-kr (PII_KINDS order), phone-kr before email, then
    // account-kr also matches the BRN form because the regex accepts 3-2-5.
    expect(kinds).toEqual(["brn", "phone-kr", "email", "account-kr"]);
  });

  it("returns matches in document order within a single kind", () => {
    const input = "first kim@a.io middle lee@b.io last park@c.io";
    const emails = detectPii(input).map((m) => m.original);
    expect(emails).toEqual(["kim@a.io", "lee@b.io", "park@c.io"]);
  });
});

describe("T2: PiiKind ↔ subcategory is a total bijection", () => {
  it("every PiiKind maps to a distinct subcategory", () => {
    const subcategories = new Set<string>();
    for (const k of PII_KINDS) {
      const sub = EXPECTED_KIND_TO_SUBCATEGORY[k];
      expect(sub).toBeDefined();
      subcategories.add(sub);
    }
    expect(subcategories.size).toBe(PII_KINDS.length);
  });

  it("round-trips kind → subcategory → kind without loss", () => {
    const inverse = new Map<string, PiiKind>();
    for (const k of PII_KINDS) {
      inverse.set(EXPECTED_KIND_TO_SUBCATEGORY[k], k);
    }
    for (const k of PII_KINDS) {
      const sub = EXPECTED_KIND_TO_SUBCATEGORY[k];
      expect(inverse.get(sub)).toBe(k);
    }
  });

  it("covers exactly the 8 known kinds", () => {
    expect(Object.keys(EXPECTED_KIND_TO_SUBCATEGORY).sort()).toEqual(
      [...PII_KINDS].sort(),
    );
  });
});

describe("T3: PII_PATTERNS regex source + flags byte-for-byte parity", () => {
  it("each PII_PATTERNS entry has the expected .source", () => {
    for (const k of PII_KINDS) {
      expect(PII_PATTERNS[k].source).toBe(EXPECTED_REGEX_SOURCE[k]);
    }
  });

  it("each PII_PATTERNS entry has the 'g' flag", () => {
    for (const k of PII_KINDS) {
      expect(PII_PATTERNS[k].flags).toContain("g");
    }
  });

  it("no PII_PATTERNS entry has unexpected flags", () => {
    for (const k of PII_KINDS) {
      expect(PII_PATTERNS[k].flags).toBe("g");
    }
  });
});

describe("T4: fullwidth card Luhn validation preserved", () => {
  it("matches fullwidth Visa test number, returns fullwidth original", () => {
    const input = "Card: ４１１１ １１１１ １１１１ １１１１";
    const matches = detectPii(input);
    const card = matches.find((m) => m.kind === "card");
    expect(card).toBeDefined();
    expect(card!.original).toBe("４１１１ １１１１ １１１１ １１１１");
    expect(card!.normalized).toBe("4111 1111 1111 1111");
  });

  it("rejects fullwidth Luhn-invalid card", () => {
    const input = "Card: ４１１１ １１１１ １１１１ １１１２";
    const cards = detectPii(input).filter((m) => m.kind === "card");
    expect(cards).toEqual([]);
  });
});

describe("T5: en-dash phone original recovery", () => {
  it("matches en-dash variant, returns en-dash original bytes", () => {
    const input = "Call 010\u20131234\u20135678 urgently";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    expect(phones[0]!.original).toBe("010\u20131234\u20135678");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

describe("T6: fullwidth phone original recovery", () => {
  it("matches fullwidth variant, returns fullwidth original bytes", () => {
    const input = "Tel ０１０-１２３４-５６７８";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    expect(phones[0]!.original).toBe("０１０-１２３４-５６７８");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

describe("T7: zero-width inside phone preserved in original bytes", () => {
  it("matches through an interior zero-width space", () => {
    const input = "Call 010-12\u200B34-5678 now";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    expect(phones[0]!.original).toContain("\u200B");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

describe("T8: luhnCheck rejects all-zero card", () => {
  it("all-zero 16-digit blob does not match as card", () => {
    const input = "Card: 0000 0000 0000 0000";
    const cards = detectPii(input).filter((m) => m.kind === "card");
    expect(cards).toEqual([]);
  });
});

describe("T9: DetectedMatch.normalized parity with normalizeForMatching", () => {
  it("for every match in a corpus, normalized === normalizeForMatching(original).text", () => {
    const corpus = [
      "Email kim@abc-corp.kr phone 010\u20131234\u20135678",
      "RRN 900101-1234567 BRN 123-45-67890 card ４１１１ １１１１ １１１１ １１１１",
      "Tel ０１０-１２３４-５６７８ EIN 12-3456789 intl +1 415 555 0199",
      "Acct 123456-12-1234567 email alice@example.com",
    ];
    for (const text of corpus) {
      const matches = detectPii(text);
      for (const m of matches) {
        const reNormalized = normalizeForMatching(m.original).text;
        expect(reNormalized).toBe(m.normalized);
      }
    }
  });
});

describe("T10: detectPii is language-agnostic", () => {
  it("detects Korean-form PII inside predominantly English text", () => {
    const input =
      "This English memo has RRN 900101-1234567 and BRN 123-45-67890";
    const kinds = detectPii(input).map((m) => m.kind);
    expect(kinds).toContain("rrn");
    expect(kinds).toContain("brn");
  });

  it("detects US-form PII inside predominantly Korean text", () => {
    const input = "이 한국어 문서에 EIN 12-3456789가 포함되어 있습니다";
    const kinds = detectPii(input).map((m) => m.kind);
    expect(kinds).toContain("ein");
  });
});

describe("T12: overlapping matches preserved in detectPii", () => {
  it("BRN-form digit string produces both brn and account-kr matches", () => {
    const input = "Tax 123-45-67890";
    const matches = detectPii(input);
    const kinds = matches.map((m) => m.kind);
    expect(kinds).toEqual(["brn", "account-kr"]);
    expect(matches.every((m) => m.original === "123-45-67890")).toBe(true);
  });
});

describe("T13: scope-level duplicate retention", () => {
  it("detectPiiInZip preserves per-scope duplicates; buildTargetsFromZip dedupes", async () => {
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Body contact legal@sunrise.com please</w:t></w:r></w:p></w:body>
</w:document>`;
    const HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:r><w:t>Header contact legal@sunrise.com also</w:t></w:r></w:p>
</w:hdr>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/_rels/document.xml.rels", DOC_RELS);
    zip.file("word/document.xml", DOC_XML);
    zip.file("word/header1.xml", HEADER_XML);

    const scoped = await detectPiiInZip(zip);
    const emailHits = scoped.filter((s) => s.match.kind === "email");
    expect(emailHits.length).toBe(2);
    const scopes = new Set(emailHits.map((s) => s.scope.path));
    expect(scopes.size).toBe(2);

    const targets = await buildTargetsFromZip(zip);
    expect(targets.filter((t) => t === "legal@sunrise.com")).toEqual([
      "legal@sunrise.com",
    ]);
  });
});

describe("T14: lastIndex pollution resistance", () => {
  it("detectPii unaffected by external lastIndex tampering", () => {
    PII_PATTERNS.email.lastIndex = 999;
    const matches = detectPii("kim@abc.kr");
    expect(matches.map((m) => m.original)).toEqual(["kim@abc.kr"]);
    PII_PATTERNS.email.lastIndex = 0;
  });
});

describe("T15: deterministic repeated invocation", () => {
  it("two identical detectPii calls return deep-equal outputs", () => {
    const text =
      "email kim@abc.kr phone 010-1234-5678 tax 123-45-67890 EIN 12-3456789";
    const first = detectPii(text);
    const second = detectPii(text);
    expect(first).toEqual(second);
  });
});

describe("T16: buildTargetsFromZip dedupes by original, not normalized", () => {
  it("ASCII and en-dash phone variants both survive as distinct targets", async () => {
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>ASCII 010-1234-5678 here</w:t></w:r></w:p>
<w:p><w:r><w:t>En-dash 010\u20131234\u20135678 here</w:t></w:r></w:p>
</w:body>
</w:document>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", DOC_XML);

    const targets = await buildTargetsFromZip(zip);
    expect(targets).toContain("010-1234-5678");
    expect(targets).toContain("010\u20131234\u20135678");
  });
});

describe("T17: same-length tie order preserved", () => {
  it("two same-length emails remain in first-insertion order", async () => {
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>aa@x.io bb@y.io</w:t></w:r></w:p></w:body>
</w:document>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", DOC_XML);

    const targets = await buildTargetsFromZip(zip);
    const aa = targets.indexOf("aa@x.io");
    const bb = targets.indexOf("bb@y.io");
    expect(aa).toBeGreaterThanOrEqual(0);
    expect(bb).toBeGreaterThanOrEqual(0);
    expect(aa).toBeLessThan(bb);
  });
});

describe("T18: worst-case fixture target array exact snapshot", () => {
  const EXPECTED_WORST_CASE_TARGETS: readonly string[] = [
    "legal@sunrise.com",
    "mike@sunrise.com",
    "+1 415 555 0199",
    "kim@abc-corp.kr",
    "010-1234-5678",
    "123-45-67890",
    "12-3456789",
  ];

  let zip: JSZip;

  beforeAll(async () => {
    const buf = fs.readFileSync(FIXTURE);
    zip = await JSZip.loadAsync(buf);
  });

  it("buildTargetsFromZip(worstCase) exactly matches v1.0 snapshot", async () => {
    const actual = await buildTargetsFromZip(zip);
    expect(actual).toEqual(EXPECTED_WORST_CASE_TARGETS);
  });
});
