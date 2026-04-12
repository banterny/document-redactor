import { describe, expectTypeOf, it } from "vitest";

import type {
  Candidate,
  Category,
  Heuristic,
  HeuristicContext,
  Language,
  Level,
  PostFilter,
  RegexRule,
  StructuralDefinition,
  StructuralParser,
} from "./types.js";

describe("types.ts exports", () => {
  it("Level is a string union of exactly three values", () => {
    const values: Level[] = ["conservative", "standard", "paranoid"];
    expectTypeOf(values).toMatchTypeOf<Level[]>();
  });

  it("Language is a string union of exactly three values", () => {
    const values: Language[] = ["ko", "en", "universal"];
    expectTypeOf(values).toMatchTypeOf<Language[]>();
  });

  it("Category includes all seven taxonomy values", () => {
    const values: Category[] = [
      "identifiers",
      "financial",
      "temporal",
      "entities",
      "structural",
      "heuristics",
      "legal",
    ];
    expectTypeOf(values).toMatchTypeOf<Category[]>();
  });

  it("RegexRule.category excludes structural and heuristics", () => {
    const bad = {
      id: "structural.x",
      // @ts-expect-error — structural is not assignable to RegexRule.category
      category: "structural",
      subcategory: "x",
      pattern: /x/g,
      levels: ["standard"],
      languages: ["universal"],
      description: "x",
    } satisfies RegexRule;
    void bad;
  });

  it("RegexRule compiles with all required fields", () => {
    const rule: RegexRule = {
      id: "identifiers.test",
      category: "identifiers",
      subcategory: "test",
      pattern: /test/g,
      levels: ["standard"],
      languages: ["universal"],
      description: "test",
    };
    expectTypeOf(rule).toMatchTypeOf<RegexRule>();
  });

  it("RegexRule accepts optional postFilter", () => {
    const filter: PostFilter = (s) => s.length > 0;
    const rule: RegexRule = {
      id: "identifiers.test-with-filter",
      category: "identifiers",
      subcategory: "test-with-filter",
      pattern: /test/g,
      postFilter: filter,
      levels: ["standard"],
      languages: ["universal"],
      description: "test with filter",
    };
    expectTypeOf(rule).toMatchTypeOf<RegexRule>();
  });

  it("Candidate requires text, ruleId, confidence", () => {
    const c: Candidate = {
      text: "hello",
      ruleId: "identifiers.test",
      confidence: 1.0,
    };
    expectTypeOf(c).toMatchTypeOf<Candidate>();
  });

  it("StructuralDefinition requires label, referent, source", () => {
    const dt: StructuralDefinition = {
      label: "the Buyer",
      referent: "ABC Corp",
      source: "definition-section",
    };
    expectTypeOf(dt).toMatchTypeOf<StructuralDefinition>();
  });

  it("HeuristicContext has readonly arrays", () => {
    const ctx: HeuristicContext = {
      structuralDefinitions: [],
      priorCandidates: [],
      documentLanguage: "mixed",
    };
    expectTypeOf(ctx).toMatchTypeOf<HeuristicContext>();
  });

  it("StructuralParser.parse returns readonly StructuralDefinition[]", () => {
    const parser: StructuralParser = {
      id: "structural.test",
      category: "structural",
      subcategory: "test",
      languages: ["en"],
      description: "test",
      parse: (_text) => [],
    };
    expectTypeOf(
      parser.parse,
    ).returns.toMatchTypeOf<readonly StructuralDefinition[]>();
  });

  it("Heuristic.detect returns readonly Candidate[]", () => {
    const h: Heuristic = {
      id: "heuristics.test",
      category: "heuristics",
      subcategory: "test",
      languages: ["en"],
      levels: ["paranoid"],
      description: "test",
      detect: (_text, _ctx) => [],
    };
    expectTypeOf(h.detect).returns.toMatchTypeOf<readonly Candidate[]>();
  });
});
