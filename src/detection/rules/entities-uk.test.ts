import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { ENTITIES_UK } from "./entities-uk.js";

function findRule(subcategory: string): RegexRule {
  const rule = ENTITIES_UK.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function matchAtLevel(
  subcategory: string,
  text: string,
  level: "conservative" | "standard" | "paranoid",
): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, level, [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("ENTITIES_UK registry", () => {
  it("exports exactly 6 rules", () => {
    expect(ENTITIES_UK).toHaveLength(6);
  });

  it("every rule id starts with 'entities.'", () => {
    for (const rule of ENTITIES_UK) {
      expect(rule.id.startsWith("entities.")).toBe(true);
    }
  });

  it("every rule has category 'entities'", () => {
    for (const rule of ENTITIES_UK) {
      expect(rule.category).toBe("entities");
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of ENTITIES_UK) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of ENTITIES_UK) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

// -- 1. uk-nhs-trust ----------------------------------------------------------

describe("entities.uk-nhs-trust", () => {
  it.each([
    [
      "matches a simple NHS Trust",
      "Barts Health NHS Trust",
      ["Barts Health NHS Trust"],
    ],
    [
      "matches an NHS Foundation Trust",
      "University Hospitals Birmingham NHS Foundation Trust",
      ["University Hospitals Birmingham NHS Foundation Trust"],
    ],
    [
      "matches a longer NHS Foundation Trust name",
      "Royal Devon University Healthcare NHS Foundation Trust",
      ["Royal Devon University Healthcare NHS Foundation Trust"],
    ],
    [
      "matches a Welsh Health Board",
      "Betsi Cadwaladr University Health Board",
      ["Betsi Cadwaladr University Health Board"],
    ],
    [
      "matches an ICB (full form)",
      "North East London Integrated Care Board",
      ["North East London Integrated Care Board"],
    ],
    [
      "matches an ICB (abbreviation)",
      "North East London ICB",
      ["North East London ICB"],
    ],
    [
      "partially matches 'Birmingham and Solihull ICB' (lowercase 'and' breaks the name chain)",
      "Birmingham and Solihull ICB",
      ["Solihull ICB"],
    ],
    [
      "matches at the start of the string",
      "Barts Health NHS Trust was negligent",
      ["Barts Health NHS Trust"],
    ],
    [
      "matches at the end of the string",
      "employed by Barts Health NHS Trust",
      ["Barts Health NHS Trust"],
    ],
    [
      "matches inside punctuation",
      "(Barts Health NHS Trust)",
      ["Barts Health NHS Trust"],
    ],
    [
      "matches a Health Authority",
      "South West London Health Authority",
      ["South West London Health Authority"],
    ],
    [
      "rejects bare NHS Trust without preceding name",
      "NHS Trust",
      [],
    ],
    [
      "rejects bare NHS Foundation Trust without preceding name",
      "NHS Foundation Trust",
      [],
    ],
    [
      "rejects lowercase names before NHS Trust",
      "barts health NHS Trust",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-nhs-trust", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long NHS Trust input", () => {
    expectFast("uk-nhs-trust", "Royal ".repeat(3000) + "NHS Trust");
  });
});

// -- 2. uk-legal-title ---------------------------------------------------------

describe("entities.uk-legal-title", () => {
  it.each([
    [
      "matches District Judge with name",
      "District Judge Taylor",
      ["District Judge Taylor"],
    ],
    [
      "matches HHJ abbreviation with name",
      "HHJ Williams",
      ["HHJ Williams"],
    ],
    [
      "matches DJ abbreviation with name",
      "DJ Brown",
      ["DJ Brown"],
    ],
    [
      "matches DDJ abbreviation with name",
      "DDJ Green",
      ["DDJ Green"],
    ],
    [
      "matches Coroner with name",
      "Coroner Jones",
      ["Coroner Jones"],
    ],
    [
      "matches Recorder with name",
      "Recorder Black",
      ["Recorder Black"],
    ],
    [
      "matches Master with name",
      "Master Clarke",
      ["Master Clarke"],
    ],
    [
      "matches Registrar with name",
      "Registrar Adams",
      ["Registrar Adams"],
    ],
    [
      "matches Deputy District Judge with name",
      "Deputy District Judge Harris",
      ["Deputy District Judge Harris"],
    ],
    [
      "matches Deputy Judge with name",
      "Deputy Judge Morris",
      ["Deputy Judge Morris"],
    ],
    [
      "matches at the start of the string",
      "District Judge Taylor presided",
      ["District Judge Taylor"],
    ],
    [
      "matches at the end of the string",
      "before HHJ Williams",
      ["HHJ Williams"],
    ],
    [
      "matches inside punctuation",
      "(Coroner Jones)",
      ["Coroner Jones"],
    ],
    [
      "matches two-part surnames",
      "District Judge Taylor Jones",
      ["District Judge Taylor Jones"],
    ],
    [
      "rejects bare title without name",
      "District Judge",
      [],
    ],
    [
      "rejects bare abbreviation without name",
      "HHJ",
      [],
    ],
    [
      "rejects lowercase name after title",
      "District Judge taylor",
      [],
    ],
    [
      "rejects HH abbreviation without name",
      "HH",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-legal-title", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long legal title input", () => {
    expectFast("uk-legal-title", "District Judge " + "A".repeat(10000));
  });
});

// -- 3. uk-kings-counsel -------------------------------------------------------

describe("entities.uk-kings-counsel", () => {
  it.each([
    [
      "matches name followed by KC",
      "Sarah Jones KC",
      ["Sarah Jones KC"],
    ],
    [
      "matches name followed by QC",
      "John Smith QC",
      ["John Smith QC"],
    ],
    [
      "matches another KC designation",
      "David Williams KC",
      ["David Williams KC"],
    ],
    [
      "matches single surname with KC",
      "Jones KC",
      ["Jones KC"],
    ],
    [
      "matches three-part name with QC",
      "Sarah Jane Williams QC",
      ["Sarah Jane Williams QC"],
    ],
    [
      "matches at the start of the string",
      "Sarah Jones KC appeared for the claimant",
      ["Sarah Jones KC"],
    ],
    [
      "matches at the end of the string",
      "represented by Sarah Jones KC",
      ["Sarah Jones KC"],
    ],
    [
      "matches inside punctuation",
      "(John Smith QC)",
      ["John Smith QC"],
    ],
    [
      "rejects bare KC alone",
      "KC",
      [],
    ],
    [
      "rejects bare QC alone",
      "QC",
      [],
    ],
    [
      "rejects lowercase names before KC",
      "sarah jones KC",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-kings-counsel", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long KC input", () => {
    expectFast("uk-kings-counsel", "Sarah ".repeat(3000) + "KC");
  });
});

// -- 4. uk-medical-title -------------------------------------------------------

describe("entities.uk-medical-title", () => {
  it.each([
    [
      "matches Consultant title",
      "Consultant Smith",
      ["Consultant Smith"],
    ],
    [
      "matches Registrar title",
      "Registrar Patel",
      ["Registrar Patel"],
    ],
    [
      "matches Staff Nurse title",
      "Staff Nurse Jones",
      ["Staff Nurse Jones"],
    ],
    [
      "matches Midwife title",
      "Midwife Williams",
      ["Midwife Williams"],
    ],
    [
      "matches Anaesthetist title",
      "Anaesthetist Brown",
      ["Anaesthetist Brown"],
    ],
    [
      "matches Surgeon title",
      "Surgeon Taylor",
      ["Surgeon Taylor"],
    ],
    [
      "matches Psychiatrist title",
      "Psychiatrist Green",
      ["Psychiatrist Green"],
    ],
    [
      "matches SHO title",
      "SHO Davies",
      ["SHO Davies"],
    ],
    [
      "matches Sister title",
      "Sister Robinson",
      ["Sister Robinson"],
    ],
    [
      "matches Charge Nurse title",
      "Charge Nurse Martin",
      ["Charge Nurse Martin"],
    ],
    [
      "matches at the start of the string",
      "Consultant Smith examined the patient",
      ["Consultant Smith"],
    ],
    [
      "matches inside punctuation",
      "(Registrar Patel)",
      ["Registrar Patel"],
    ],
    [
      "matches two-part surnames",
      "Consultant Taylor Jones",
      ["Consultant Taylor Jones"],
    ],
    [
      "rejects bare title without name",
      "Consultant",
      [],
    ],
    [
      "rejects bare compound title without name",
      "Staff Nurse",
      [],
    ],
    [
      "rejects lowercase name after title",
      "Consultant smith",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-medical-title", text)).toEqual(expected);
  });

  it("does NOT match at 'standard' level (paranoid tier only)", () => {
    expect(matchAtLevel("uk-medical-title", "Consultant Smith", "standard")).toEqual([]);
  });

  it("does NOT match at 'conservative' level (paranoid tier only)", () => {
    expect(matchAtLevel("uk-medical-title", "Consultant Smith", "conservative")).toEqual([]);
  });

  it("matches at 'paranoid' level", () => {
    expect(matchAtLevel("uk-medical-title", "Consultant Smith", "paranoid")).toEqual([
      "Consultant Smith",
    ]);
  });

  it("is ReDoS-safe on long medical title input", () => {
    expectFast("uk-medical-title", "Consultant " + "A".repeat(10000));
  });
});

// -- 5. uk-medical-context -----------------------------------------------------

describe("entities.uk-medical-context", () => {
  it.each([
    [
      "matches Patient label (leading space included in capture)",
      "Patient: John Smith",
      [" John Smith"],
    ],
    [
      "matches D.O.B label with dots",
      "D.O.B: 15/03/1980",
      [" 15/03/1980"],
    ],
    [
      "matches GP label",
      "GP: Dr Williams",
      [" Dr Williams"],
    ],
    [
      "matches Ward label",
      "Ward: 7B",
      [" 7B"],
    ],
    [
      "matches Consultant label",
      "Consultant: Mr Taylor",
      [" Mr Taylor"],
    ],
    [
      "matches DOB label without dots",
      "DOB: 01/01/1990",
      [" 01/01/1990"],
    ],
    [
      "matches Patient Name label",
      "Patient Name: Jane Doe",
      [" Jane Doe"],
    ],
    [
      "matches Next of Kin label",
      "Next of Kin: Mary Smith",
      [" Mary Smith"],
    ],
    [
      "matches Specialty label",
      "Specialty: Cardiology",
      [" Cardiology"],
    ],
    [
      "matches General Practitioner label",
      "General Practitioner: Dr Jones",
      [" Dr Jones"],
    ],
    [
      "matches cleanly with no space after colon",
      "Patient:John Smith",
      ["John Smith"],
    ],
    [
      "matches multiple labels in one text",
      "Patient: John Smith\nWard: 7B",
      [" John Smith", " 7B"],
    ],
    [
      "stops at semicolons",
      "Patient: John Smith; further notes",
      [" John Smith"],
    ],
    [
      "stops at newlines",
      "GP: Dr Williams\nConsultant: Mr Taylor",
      [" Dr Williams", " Mr Taylor"],
    ],
    [
      "matches Date of Birth label",
      "Date of Birth: 15/03/1980",
      [" 15/03/1980"],
    ],
    [
      "matches Date of Death label",
      "Date of Death: 01/01/2020",
      [" 01/01/2020"],
    ],
    [
      "matches DOD label",
      "DOD: 01/01/2020",
      [" 01/01/2020"],
    ],
    [
      "matches NOK label",
      "NOK: Mary Smith",
      [" Mary Smith"],
    ],
    [
      "matches Referring Clinician label",
      "Referring Clinician: Dr Brown",
      [" Dr Brown"],
    ],
    [
      "rejects text without label prefix",
      "John Smith",
      [],
    ],
    [
      "rejects label without colon",
      "Patient John Smith",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-medical-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long medical context input", () => {
    expectFast("uk-medical-context", "Patient: " + "A".repeat(10000));
  });
});

// -- 6. uk-inquest-context -----------------------------------------------------

describe("entities.uk-inquest-context", () => {
  it.each([
    [
      "matches 'Touching the death of' phrase",
      "Touching the death of John Smith",
      ["John Smith"],
    ],
    [
      "matches 'Into the death of' phrase",
      "Into the death of Jane Doe",
      ["Jane Doe"],
    ],
    [
      "matches 'Deceased:' label",
      "Deceased: John Williams",
      ["John Williams"],
    ],
    [
      "matches 'The late' phrase",
      "The late Arthur Brown",
      ["Arthur Brown"],
    ],
    [
      "matches 'The deceased' phrase",
      "The deceased Michael Green",
      ["Michael Green"],
    ],
    [
      "matches 'Deceased' without colon (space only)",
      "Deceased John Williams",
      ["John Williams"],
    ],
    [
      "matches hyphenated surnames",
      "Touching the death of Mary Anne-Smith",
      ["Mary Anne-Smith"],
    ],
    [
      "matches names with apostrophes",
      "Into the death of Patrick O'Brien",
      ["Patrick O'Brien"],
    ],
    [
      "matches at the start of the string",
      "Touching the death of John Smith in the matter of",
      ["John Smith"],
    ],
    [
      "matches at the end of the string",
      "Into the death of Jane Doe",
      ["Jane Doe"],
    ],
    [
      "matches inside punctuation",
      "(Deceased: John Williams)",
      ["John Williams"],
    ],
    [
      "matches three-part names",
      "The late Mary Jane Williams",
      ["Mary Jane Williams"],
    ],
    [
      "rejects bare names without preceding label",
      "John Smith",
      [],
    ],
    [
      "rejects names not preceded by inquest phrase",
      "The claimant John Smith",
      [],
    ],
    [
      "rejects lowercase names after inquest phrase",
      "Touching the death of john smith",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-inquest-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long inquest context input", () => {
    expectFast(
      "uk-inquest-context",
      "Touching the death of " + "A".repeat(10000),
    );
  });
});
