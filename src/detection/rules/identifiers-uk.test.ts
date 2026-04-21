import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { IDENTIFIERS_UK } from "./identifiers-uk.js";

function findRule(subcategory: string): RegexRule {
  const rule = IDENTIFIERS_UK.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

// ---------------------------------------------------------------------------
// Registry-level checks
// ---------------------------------------------------------------------------

describe("IDENTIFIERS_UK registry", () => {
  it("exports exactly 9 rules", () => {
    expect(IDENTIFIERS_UK).toHaveLength(9);
  });

  it("every rule id starts with 'identifiers.'", () => {
    for (const rule of IDENTIFIERS_UK) {
      expect(rule.id.startsWith("identifiers.")).toBe(true);
    }
  });

  it("every rule has category 'identifiers'", () => {
    for (const rule of IDENTIFIERS_UK) {
      expect(rule.category).toBe("identifiers");
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of IDENTIFIERS_UK) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of IDENTIFIERS_UK) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. UK National Insurance Number (NINO)
// ---------------------------------------------------------------------------

describe("identifiers.uk-nino", () => {
  it.each([
    ["matches with spaces", "AB 12 34 56 C", ["AB 12 34 56 C"]],
    ["matches without spaces", "AB123456C", ["AB123456C"]],
    ["matches lowercase", "ab 12 34 56 c", ["ab 12 34 56 c"]],
    ["matches CE prefix", "CE 99 88 77 A", ["CE 99 88 77 A"]],
    ["matches JK prefix", "JK 00 11 22 D", ["JK 00 11 22 D"]],
    ["matches suffix B", "HJ 12 34 56 B", ["HJ 12 34 56 B"]],
    ["matches at the start of the string", "AB123456C rest", ["AB123456C"]],
    ["matches at the end of the string", "NINO: AB123456C", ["AB123456C"]],
    ["matches inside punctuation", "(AB 12 34 56 C)", ["AB 12 34 56 C"]],
    [
      "rejects prefix starting with D (invalid first letter)",
      "DA 12 34 56 A",
      [],
    ],
    [
      "rejects prefix starting with F (invalid first letter)",
      "FA 12 34 56 A",
      [],
    ],
    [
      "rejects prefix starting with I (invalid first letter)",
      "IA 12 34 56 A",
      [],
    ],
    [
      "rejects prefix starting with Q (invalid first letter)",
      "QA 12 34 56 A",
      [],
    ],
    [
      "rejects prefix starting with U (invalid first letter)",
      "UA 12 34 56 A",
      [],
    ],
    [
      "rejects prefix starting with V (invalid first letter)",
      "VA 12 34 56 A",
      [],
    ],
    [
      "rejects suffix E (only A-D valid)",
      "AB 12 34 56 E",
      [],
    ],
    [
      "rejects when embedded in a word (letters before prefix)",
      "XAB123456C",
      [],
    ],
    [
      "rejects when followed by a letter",
      "AB 12 34 56 Cx",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-nino", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-nino", "AB" + " 12".repeat(2500));
  });
});

// ---------------------------------------------------------------------------
// 2. NHS Number (Modulus 11 check digit)
// ---------------------------------------------------------------------------

describe("identifiers.uk-nhs-number", () => {
  it.each([
    [
      "matches valid NHS number with spaces (943 476 5919)",
      "943 476 5919",
      ["943 476 5919"],
    ],
    [
      "matches valid NHS number without spaces",
      "9434765919",
      ["9434765919"],
    ],
    [
      "matches another valid NHS number (450 557 7104)",
      "450 557 7104",
      ["450 557 7104"],
    ],
    [
      "matches valid NHS number (400 000 0004)",
      "400 000 0004",
      ["400 000 0004"],
    ],
    [
      "matches at the start of the string",
      "9434765919 is the ID",
      ["9434765919"],
    ],
    [
      "matches at the end of the string",
      "NHS: 943 476 5919",
      ["943 476 5919"],
    ],
    [
      "matches inside punctuation",
      "(9434765919)",
      ["9434765919"],
    ],
    [
      "rejects invalid check digit (943 476 5918)",
      "943 476 5918",
      [],
    ],
    [
      "rejects invalid check digit (943 476 5910)",
      "943 476 5910",
      [],
    ],
    [
      "rejects 9 digits (too short)",
      "943 476 591",
      [],
    ],
    [
      "rejects 11 digits (too long)",
      "943 476 59190",
      [],
    ],
    [
      "rejects when preceded by a digit",
      "19434765919",
      [],
    ],
    [
      "rejects when followed by a digit",
      "94347659190",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-nhs-number", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-nhs-number", "123 456 ".repeat(625));
  });
});

// ---------------------------------------------------------------------------
// 3. UK Domestic Phone
// ---------------------------------------------------------------------------

describe("identifiers.uk-phone-domestic", () => {
  it.each([
    [
      "matches mobile (07700 900123)",
      "07700 900123",
      ["07700 900123"],
    ],
    [
      "matches London landline (0207 946 0958)",
      "0207 946 0958",
      ["0207 946 0958"],
    ],
    [
      "matches Bristol landline (0117 496 0123)",
      "0117 496 0123",
      ["0117 496 0123"],
    ],
    [
      "matches Leeds landline (0113 278 1234)",
      "0113 278 1234",
      ["0113 278 1234"],
    ],
    [
      "matches non-geographic (0300 123 4567)",
      "0300 123 4567",
      ["0300 123 4567"],
    ],
    [
      "matches at the start of the string",
      "07700 900123 call",
      ["07700 900123"],
    ],
    [
      "matches at the end of the string",
      "Tel: 07700 900123",
      ["07700 900123"],
    ],
    [
      "matches inside punctuation",
      "(0117 496 0123)",
      ["0117 496 0123"],
    ],
    [
      "matches with hyphens",
      "0117-496-0123",
      ["0117-496-0123"],
    ],
    [
      "rejects too many digits (12 total, postFilter)",
      "0123 4567 8901",
      [],
    ],
    [
      "rejects too many digits (14 total, postFilter)",
      "012345 6789 0123",
      [],
    ],
    [
      "rejects when preceded by a digit",
      "10117 496 0123",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-phone-domestic", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-phone-domestic", "07700" + " 900".repeat(1250));
  });
});

// ---------------------------------------------------------------------------
// 4. UK Postcode
// ---------------------------------------------------------------------------

describe("identifiers.uk-postcode", () => {
  it.each([
    ["matches SW1A 1AA", "SW1A 1AA", ["SW1A 1AA"]],
    ["matches B2 4QA", "B2 4QA", ["B2 4QA"]],
    ["matches EC1A 1BB", "EC1A 1BB", ["EC1A 1BB"]],
    ["matches M1 1AA", "M1 1AA", ["M1 1AA"]],
    ["matches without space", "SW1A1AA", ["SW1A1AA"]],
    ["matches lowercase", "sw1a 1aa", ["sw1a 1aa"]],
    ["matches at the start of the string", "SW1A 1AA is central", ["SW1A 1AA"]],
    ["matches at the end of the string", "Address: SW1A 1AA", ["SW1A 1AA"]],
    ["matches inside punctuation", "(EC1A 1BB)", ["EC1A 1BB"]],
    [
      "rejects when preceded by a letter",
      "XSW1A 1AA",
      [],
    ],
    [
      "rejects when preceded by a digit",
      "1SW1A 1AA",
      [],
    ],
    [
      "rejects when followed by a letter",
      "SW1A 1AAx",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-postcode", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-postcode", "SW1A ".repeat(1000));
  });
});

// ---------------------------------------------------------------------------
// 5. GMC Number (context-gated)
// ---------------------------------------------------------------------------

describe("identifiers.uk-gmc", () => {
  it.each([
    [
      "matches with GMC No: label",
      "GMC No: 1234567",
      ["1234567"],
    ],
    [
      "matches with GMC: label",
      "GMC: 1234567",
      ["1234567"],
    ],
    [
      "matches with GMC label (no colon)",
      "GMC 1234567",
      ["1234567"],
    ],
    [
      "matches with General Medical Council label",
      "General Medical Council 1234567",
      ["1234567"],
    ],
    [
      "matches with GMC Number label",
      "GMC Number: 1234567",
      ["1234567"],
    ],
    [
      "matches with GMC Reg label",
      "GMC Reg 1234567",
      ["1234567"],
    ],
    [
      "matches with Registration No label",
      "Registration No: 1234567",
      ["1234567"],
    ],
    [
      "matches at the end of the string",
      "GMC: 1234567",
      ["1234567"],
    ],
    [
      "matches inside punctuation",
      "(GMC: 1234567)",
      ["1234567"],
    ],
    [
      "rejects bare 7-digit number without label",
      "1234567",
      [],
    ],
    [
      "rejects 6-digit number with label",
      "GMC: 123456",
      [],
    ],
    [
      "rejects 8-digit number with label",
      "GMC: 12345678",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-gmc", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-gmc", "GMC: " + "1234567 ".repeat(625));
  });
});

// ---------------------------------------------------------------------------
// 6. NMC PIN (context-gated)
// ---------------------------------------------------------------------------

describe("identifiers.uk-nmc", () => {
  it.each([
    [
      "matches with NMC PIN: label",
      "NMC PIN: 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches with NMC: label",
      "NMC: 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches with NMC No label",
      "NMC No: 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches with NMC (no colon)",
      "NMC 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches with Nursing and Midwifery Council label",
      "Nursing and Midwifery Council 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches lowercase PIN",
      "NMC: 12a3456b",
      ["12a3456b"],
    ],
    [
      "matches at the end of the string",
      "NMC: 12A3456B",
      ["12A3456B"],
    ],
    [
      "matches inside punctuation",
      "(NMC: 12A3456B)",
      ["12A3456B"],
    ],
    [
      "rejects bare PIN without label",
      "12A3456B",
      [],
    ],
    [
      "rejects PIN followed by alphanumeric",
      "NMC: 12A3456BX",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-nmc", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-nmc", "NMC: " + "12A3456B ".repeat(555));
  });
});

// ---------------------------------------------------------------------------
// 7. UK Driving Licence
// ---------------------------------------------------------------------------

describe("identifiers.uk-driving-licence", () => {
  it.each([
    [
      "matches valid format (SMITH861215J99KA12)",
      "SMITH861215J99KA12",
      ["SMITH861215J99KA12"],
    ],
    [
      "matches shorter surname hash (JONES710519H93BA09)",
      "JONES710519H93BA09",
      ["JONES710519H93BA09"],
    ],
    [
      "matches single-letter surname hash (B861215J99KA12)",
      "B861215J99KA12",
      ["B861215J99KA12"],
    ],
    [
      "matches lowercase",
      "smith861215j99ka12",
      ["smith861215j99ka12"],
    ],
    [
      "matches at the start of the string",
      "SMITH861215J99KA12 is the licence",
      ["SMITH861215J99KA12"],
    ],
    [
      "matches at the end of the string",
      "Licence: SMITH861215J99KA12",
      ["SMITH861215J99KA12"],
    ],
    [
      "matches inside punctuation",
      "(SMITH861215J99KA12)",
      ["SMITH861215J99KA12"],
    ],
    [
      "rejects too short (missing trailing digits)",
      "SMITH861215J99KA",
      [],
    ],
    [
      "rejects too long (extra trailing digits)",
      "SMITH861215J99KA123",
      [],
    ],
    [
      "rejects when preceded by a letter",
      "XSMITH861215J99KA12",
      [],
    ],
    [
      "rejects when followed by a digit",
      "SMITH861215J99KA123",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-driving-licence", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-driving-licence", "ABCDE" + "123456".repeat(833));
  });
});

// ---------------------------------------------------------------------------
// 8. Hospital Number / MRN (context-gated)
// ---------------------------------------------------------------------------

describe("identifiers.uk-hospital-mrn", () => {
  it.each([
    [
      "matches MRN with trust code (MRN: RXH 123456)",
      "MRN: RXH 123456",
      ["RXH 123456"],
    ],
    [
      "matches MRN bare digits (MRN: 123456)",
      "MRN: 123456",
      [" 123456"],
    ],
    [
      "matches Patient No label",
      "Patient No: 12345678",
      [" 12345678"],
    ],
    [
      "matches Patient Number label",
      "Patient Number: 123456",
      [" 123456"],
    ],
    [
      "matches Patient ID label",
      "Patient ID: 12345678",
      [" 12345678"],
    ],
    [
      "matches Hospital No label",
      "Hospital No: 123456",
      [" 123456"],
    ],
    [
      "matches Hospital Number label",
      "Hospital Number: 123456",
      [" 123456"],
    ],
    [
      "matches Hospital Ref label",
      "Hospital Ref: 123456",
      [" 123456"],
    ],
    [
      "matches Unit No label",
      "Unit No: 123456",
      [" 123456"],
    ],
    [
      "matches Hosp No label",
      "Hosp No: 123456",
      [" 123456"],
    ],
    [
      "matches Hosp. No label",
      "Hosp. No: 123456",
      [" 123456"],
    ],
    [
      "matches at the end of the string",
      "MRN: 123456",
      [" 123456"],
    ],
    [
      "rejects bare number without label",
      "123456",
      [],
    ],
    [
      "rejects bare number with trust code but no label",
      "RXH 123456",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-hospital-mrn", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-hospital-mrn", "MRN: " + "123456 ".repeat(714));
  });
});

// ---------------------------------------------------------------------------
// 9. UK Bank Sort Code (context-gated)
// ---------------------------------------------------------------------------

describe("identifiers.uk-sort-code", () => {
  it.each([
    [
      "matches Sort Code with hyphens",
      "Sort Code: 12-34-56",
      ["12-34-56"],
    ],
    [
      "matches S/C label compact",
      "S/C: 123456",
      ["123456"],
    ],
    [
      "matches Sort label (no Code)",
      "Sort: 12-34-56",
      ["12-34-56"],
    ],
    [
      "matches SC label",
      "SC: 12-34-56",
      ["12-34-56"],
    ],
    [
      "matches Sort Code with spaces instead of hyphens",
      "Sort Code: 12 34 56",
      ["12 34 56"],
    ],
    [
      "matches Sort Code no separator",
      "Sort Code: 123456",
      ["123456"],
    ],
    [
      "matches at the end of the string",
      "Sort Code: 12-34-56",
      ["12-34-56"],
    ],
    [
      "matches inside punctuation",
      "(Sort Code: 12-34-56)",
      ["12-34-56"],
    ],
    [
      "rejects bare sort code without label",
      "12-34-56",
      [],
    ],
    [
      "rejects bare 6-digit number without label",
      "123456",
      [],
    ],
    [
      "rejects when followed by extra digits",
      "Sort Code: 12-34-567",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-sort-code", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological input", () => {
    expectFast("uk-sort-code", "Sort Code: " + "12-34-56 ".repeat(555));
  });
});
