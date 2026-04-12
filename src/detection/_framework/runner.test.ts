import { describe, expect, it } from "vitest";

import { IDENTIFIERS } from "../rules/identifiers.js";
import type {
  Heuristic,
  HeuristicContext,
  Language,
  Level,
  RegexRule,
  StructuralDefinition,
  StructuralParser,
} from "./types.js";
import {
  runAllPhases,
  runHeuristicPhase,
  runRegexPhase,
  runStructuralPhase,
} from "./runner.js";

const EMAIL_RULE: RegexRule = {
  id: "identifiers.email",
  category: "identifiers",
  subcategory: "email",
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  levels: ["conservative", "standard", "paranoid"],
  languages: ["universal"],
  description: "email",
};

const PHONE_KR_RULE: RegexRule = {
  id: "identifiers.phone-kr",
  category: "identifiers",
  subcategory: "phone-kr",
  pattern: /(?<!\d)01[016-9]-?\d{3,4}-?\d{4}(?!\d)/g,
  levels: ["conservative", "standard", "paranoid"],
  languages: ["ko"],
  description: "Korean mobile",
};

const PARANOID_ONLY_RULE: RegexRule = {
  id: "identifiers.paranoid-only-test",
  category: "identifiers",
  subcategory: "paranoid-only-test",
  pattern: /TEST/g,
  levels: ["paranoid"],
  languages: ["universal"],
  description: "paranoid-only test rule",
};

function makeRule(
  id: string,
  pattern: RegExp,
  languages: readonly Language[],
  levels: readonly Level[] = ["conservative", "standard", "paranoid"],
): RegexRule {
  const [, subcategory] = id.split(".", 2);
  return {
    id,
    category: "identifiers",
    subcategory: subcategory!,
    pattern,
    levels,
    languages,
    description: id,
  };
}

function makeParser(
  id: string,
  languages: readonly Language[],
  parse: StructuralParser["parse"],
): StructuralParser {
  const [, subcategory] = id.split(".", 2);
  return {
    id,
    category: "structural",
    subcategory: subcategory!,
    languages,
    description: id,
    parse,
  };
}

function makeHeuristic(
  id: string,
  languages: readonly Language[],
  levels: readonly Level[],
  detect: Heuristic["detect"],
): Heuristic {
  const [, subcategory] = id.split(".", 2);
  return {
    id,
    category: "heuristics",
    subcategory: subcategory!,
    languages,
    levels,
    description: id,
    detect,
  };
}

describe("runRegexPhase", () => {
  it("returns [] for empty text", () => {
    expect(runRegexPhase("", "standard", [EMAIL_RULE])).toEqual([]);
  });

  it("returns [] when no rules match", () => {
    expect(runRegexPhase("hello world", "standard", [EMAIL_RULE])).toEqual([]);
  });

  it("returns a Candidate for a single match", () => {
    const candidates = runRegexPhase(
      "Contact legal@sunrise.com for details",
      "standard",
      [EMAIL_RULE],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!).toMatchObject({
      text: "legal@sunrise.com",
      ruleId: "identifiers.email",
      confidence: 1,
    });
  });

  it("returns multiple candidates for multiple matches", () => {
    const candidates = runRegexPhase("a@x.com and b@y.com", "standard", [
      EMAIL_RULE,
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.text)).toEqual(["a@x.com", "b@y.com"]);
  });

  it("applies postFilter to reject false positives", () => {
    const BAD_RULE: RegexRule = {
      id: "identifiers.test-filter",
      category: "identifiers",
      subcategory: "test-filter",
      pattern: /\d{4}/g,
      postFilter: (m) => m === "1234",
      levels: ["standard"],
      languages: ["universal"],
      description: "test",
    };
    const candidates = runRegexPhase("5678 1234 9999", "standard", [BAD_RULE]);
    expect(candidates.map((c) => c.text)).toEqual(["1234"]);
  });

  it("filters out rules whose levels do not include the given level", () => {
    const candidates = runRegexPhase("TEST string here", "standard", [
      PARANOID_ONLY_RULE,
    ]);
    expect(candidates).toEqual([]);
  });

  it("includes rules whose levels do match", () => {
    const candidates = runRegexPhase("TEST string here", "paranoid", [
      PARANOID_ONLY_RULE,
    ]);
    expect(candidates.map((c) => c.text)).toEqual(["TEST"]);
  });

  it("runs multiple rules in order they appear in the input array", () => {
    const candidates = runRegexPhase(
      "legal@sunrise.com and 010-1234-5678",
      "standard",
      [EMAIL_RULE, PHONE_KR_RULE],
    );
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.email",
      "identifiers.phone-kr",
    ]);
  });

  it("recovers ORIGINAL bytes (not normalized) for en-dashed phone", () => {
    const candidates = runRegexPhase("010\u20131234\u20135678", "standard", [
      PHONE_KR_RULE,
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.text).toBe("010\u20131234\u20135678");
  });

  it("is deterministic — same input yields same output", () => {
    const text = "a@x.com b@y.com 010-1234-5678";
    const first = runRegexPhase(text, "standard", [EMAIL_RULE, PHONE_KR_RULE]);
    const second = runRegexPhase(text, "standard", [EMAIL_RULE, PHONE_KR_RULE]);
    expect(first).toEqual(second);
  });

  it("produces identical output for conservative, standard, and paranoid over IDENTIFIERS", () => {
    const text =
      "Email legal@sunrise.com phone 010-1234-5678 BRN 123-45-67890 card 4111 1111 1111 1111";
    const conservative = runRegexPhase(text, "conservative", IDENTIFIERS);
    const standard = runRegexPhase(text, "standard", IDENTIFIERS);
    const paranoid = runRegexPhase(text, "paranoid", IDENTIFIERS);
    expect(conservative).toEqual(standard);
    expect(paranoid).toEqual(standard);
  });
});

describe("runRegexPhase — language filter", () => {
  const koRule = makeRule("identifiers.ko-only", /KO/g, ["ko"]);
  const enRule = makeRule("identifiers.en-only", /EN/g, ["en"]);
  const universalRule = makeRule(
    "identifiers.universal-only",
    /UNIVERSAL/g,
    ["universal"],
  );
  const bilingualRule = makeRule("identifiers.bilingual", /BOTH/g, ["ko", "en"]);

  it("three-arg form runs every rule regardless of language", () => {
    const candidates = runRegexPhase("KO EN", "standard", [koRule, enRule]);
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.ko-only",
      "identifiers.en-only",
    ]);
  });

  it('language "ko" skips rules whose languages is ["en"]', () => {
    const candidates = runRegexPhase("EN", "standard", [enRule], {
      language: "ko",
    });
    expect(candidates).toEqual([]);
  });

  it('language "ko" includes rules whose languages is ["universal"]', () => {
    const candidates = runRegexPhase("UNIVERSAL", "standard", [universalRule], {
      language: "ko",
    });
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.universal-only",
    ]);
  });

  it('language "ko" includes rules whose languages is ["ko"]', () => {
    const candidates = runRegexPhase("KO", "standard", [koRule], {
      language: "ko",
    });
    expect(candidates.map((c) => c.ruleId)).toEqual(["identifiers.ko-only"]);
  });

  it('language "en" skips ko-only rules', () => {
    const candidates = runRegexPhase("KO", "standard", [koRule], {
      language: "en",
    });
    expect(candidates).toEqual([]);
  });

  it('language "en" includes universal-only rules', () => {
    const candidates = runRegexPhase("UNIVERSAL", "standard", [universalRule], {
      language: "en",
    });
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.universal-only",
    ]);
  });

  it('language "mixed" runs every rule regardless of language', () => {
    const candidates = runRegexPhase("KO EN BOTH", "standard", [
      koRule,
      enRule,
      bilingualRule,
    ], {
      language: "mixed",
    });
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.ko-only",
      "identifiers.en-only",
      "identifiers.bilingual",
    ]);
  });

  it("explicit language undefined behaves identical to omitted opts", () => {
    const text = "KO EN";
    const omitted = runRegexPhase(text, "standard", [koRule, enRule]);
    const explicitUndefined = {
      language: undefined,
    } as unknown as { language?: "ko" | "en" | "mixed" };
    const explicit = runRegexPhase(
      text,
      "standard",
      [koRule, enRule],
      explicitUndefined,
    );
    expect(explicit).toEqual(omitted);
  });

  it('a rule with languages ["ko", "en"] runs under both ko and en filters', () => {
    expect(
      runRegexPhase("BOTH", "standard", [bilingualRule], {
        language: "ko",
      }).map((c) => c.ruleId),
    ).toEqual(["identifiers.bilingual"]);
    expect(
      runRegexPhase("BOTH", "standard", [bilingualRule], {
        language: "en",
      }).map((c) => c.ruleId),
    ).toEqual(["identifiers.bilingual"]);
  });

  it("level filter and language filter compose with AND", () => {
    const gated = makeRule("identifiers.gated", /TEST/g, ["en"], ["paranoid"]);
    expect(
      runRegexPhase("TEST", "standard", [gated], { language: "en" }),
    ).toEqual([]);
    expect(
      runRegexPhase("TEST", "paranoid", [gated], { language: "ko" }),
    ).toEqual([]);
    expect(
      runRegexPhase("TEST", "paranoid", [gated], { language: "en" }).map(
        (c) => c.ruleId,
      ),
    ).toEqual(["identifiers.gated"]);
  });

  it("empty rules array returns [] regardless of filters", () => {
    expect(runRegexPhase("KO", "standard", [], { language: "ko" })).toEqual([]);
  });

  it("the 8 IDENTIFIERS rules all fire on a Phase 0 smoke input via the three-arg form", () => {
    const text = [
      "900101-1234567",
      "123-45-67890",
      "12-3456789",
      "010-1234-5678",
      "+82-10-1234-5678",
      "kim@abc.kr",
      "123456-12-1234567",
      "4111 1111 1111 1111",
    ].join(" ");
    const candidates = runRegexPhase(text, "standard", IDENTIFIERS);
    expect(new Set(candidates.map((c) => c.ruleId))).toEqual(
      new Set([
        "identifiers.korean-rrn",
        "identifiers.korean-brn",
        "identifiers.us-ein",
        "identifiers.phone-kr",
        "identifiers.phone-intl",
        "identifiers.email",
        "identifiers.account-kr",
        "identifiers.credit-card",
      ]),
    );
  });
});

describe("runStructuralPhase", () => {
  it("empty parsers array returns empty readonly StructuralDefinition[]", () => {
    expect(runStructuralPhase("text", [])).toEqual([]);
  });

  it("single parser emitting 3 definitions passes them through unchanged", () => {
    const defs: readonly StructuralDefinition[] = [
      { label: "A", referent: "B", source: "definition-section" },
      { label: "C", referent: "D", source: "recitals" },
      { label: "E", referent: "F", source: "party-declaration" },
    ];
    const parser = makeParser("structural.single", ["en"], () => defs);
    expect(runStructuralPhase("text", [parser], { language: "en" })).toEqual(
      defs,
    );
  });

  it("two parsers output concatenates in parser-array order", () => {
    const first = makeParser("structural.first", ["en"], () => [
      { label: "first", referent: "A", source: "definition-section" },
    ]);
    const second = makeParser("structural.second", ["en"], () => [
      { label: "second", referent: "B", source: "recitals" },
    ]);
    expect(
      runStructuralPhase("text", [first, second], { language: "en" }).map(
        (d) => d.label,
      ),
    ).toEqual(["first", "second"]);
  });

  it('language "ko" skips English-only parser', () => {
    const parser = makeParser("structural.en-only", ["en"], () => [
      { label: "X", referent: "Y", source: "definition-section" },
    ]);
    expect(runStructuralPhase("text", [parser], { language: "ko" })).toEqual(
      [],
    );
  });

  it('language "en" skips Korean-only parser', () => {
    const parser = makeParser("structural.ko-only", ["ko"], () => [
      { label: "X", referent: "Y", source: "definition-section" },
    ]);
    expect(runStructuralPhase("text", [parser], { language: "en" })).toEqual(
      [],
    );
  });

  it('parser with languages ["universal"] runs under any filter', () => {
    const parser = makeParser("structural.universal", ["universal"], () => [
      { label: "X", referent: "Y", source: "definition-section" },
    ]);
    expect(runStructuralPhase("text", [parser], { language: "ko" })).toHaveLength(
      1,
    );
    expect(runStructuralPhase("text", [parser], { language: "en" })).toHaveLength(
      1,
    );
  });

  it('language "mixed" runs every parser', () => {
    const koParser = makeParser("structural.ko", ["ko"], () => [
      { label: "ko", referent: "A", source: "definition-section" },
    ]);
    const enParser = makeParser("structural.en", ["en"], () => [
      { label: "en", referent: "B", source: "recitals" },
    ]);
    expect(
      runStructuralPhase("text", [koParser, enParser], {
        language: "mixed",
      }).map((d) => d.label),
    ).toEqual(["ko", "en"]);
  });

  it("parser that throws bubbles up (fail-loud)", () => {
    const parser = makeParser("structural.throw", ["en"], () => {
      throw new Error("boom");
    });
    expect(() =>
      runStructuralPhase("text", [parser], { language: "en" }),
    ).toThrow("boom");
  });

  it("parser receives NORMALIZED text", () => {
    const parser = makeParser("structural.normalized", ["en"], (text) => {
      if (text.includes("ABC")) {
        return [{ label: "ABC", referent: "ABC", source: "definition-section" }];
      }
      return [];
    });
    expect(runStructuralPhase("ＡＢＣ", [parser], { language: "en" })).toEqual(
      [{ label: "ABC", referent: "ABC", source: "definition-section" }],
    );
  });

  it("empty input text returns [] without calling any parser", () => {
    let called = false;
    const parser = makeParser("structural.never", ["en"], () => {
      called = true;
      return [];
    });
    expect(runStructuralPhase("", [parser], { language: "en" })).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("runHeuristicPhase", () => {
  const baseContext: HeuristicContext = {
    structuralDefinitions: [{ label: "Buyer", referent: "ABC", source: "definition-section" }],
    priorCandidates: [{ text: "ABC", ruleId: "entities.name", confidence: 1 }],
    documentLanguage: "mixed",
  };

  it("empty heuristics array returns []", () => {
    expect(runHeuristicPhase("text", "standard", [], baseContext)).toEqual([]);
  });

  it("single heuristic output passes through unchanged", () => {
    const heuristic = makeHeuristic(
      "heuristics.single",
      ["en"],
      ["standard"],
      () => [{ text: "X", ruleId: "heuristics.single", confidence: 0.75 }],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toEqual([{ text: "X", ruleId: "heuristics.single", confidence: 0.75 }]);
  });

  it("context.structuralDefinitions is reachable from inside the heuristic", () => {
    const heuristic = makeHeuristic(
      "heuristics.struct-defs",
      ["en"],
      ["standard"],
      (_text, context) => [
        {
          text: String(context.structuralDefinitions.length),
          ruleId: "heuristics.struct-defs",
          confidence: 0.7,
        },
      ],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      })[0]!.text,
    ).toBe("1");
  });

  it("context.priorCandidates is reachable from inside the heuristic", () => {
    const heuristic = makeHeuristic(
      "heuristics.prior",
      ["en"],
      ["standard"],
      (_text, context) => [
        {
          text: String(context.priorCandidates.length),
          ruleId: "heuristics.prior",
          confidence: 0.7,
        },
      ],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      })[0]!.text,
    ).toBe("1");
  });

  it("context.documentLanguage is reachable from inside the heuristic", () => {
    const heuristic = makeHeuristic(
      "heuristics.language",
      ["en"],
      ["standard"],
      (_text, context) => [
        {
          text: context.documentLanguage,
          ruleId: "heuristics.language",
          confidence: 0.7,
        },
      ],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      })[0]!.text,
    ).toBe("mixed");
  });

  it("level filter is applied", () => {
    const heuristic = makeHeuristic(
      "heuristics.paranoid",
      ["en"],
      ["paranoid"],
      () => [{ text: "X", ruleId: "heuristics.paranoid", confidence: 0.6 }],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toEqual([]);
  });

  it("language filter is applied", () => {
    const heuristic = makeHeuristic(
      "heuristics.ko-only",
      ["ko"],
      ["standard"],
      () => [{ text: "X", ruleId: "heuristics.ko-only", confidence: 0.6 }],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toEqual([]);
  });

  it("a throwing heuristic bubbles up", () => {
    const heuristic = makeHeuristic(
      "heuristics.throw",
      ["en"],
      ["standard"],
      () => {
        throw new Error("boom");
      },
    );
    expect(() =>
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toThrow("boom");
  });

  it("two heuristics output concatenates in heuristic-array order", () => {
    const first = makeHeuristic(
      "heuristics.first",
      ["en"],
      ["standard"],
      () => [{ text: "first", ruleId: "heuristics.first", confidence: 0.9 }],
    );
    const second = makeHeuristic(
      "heuristics.second",
      ["en"],
      ["standard"],
      () => [{ text: "second", ruleId: "heuristics.second", confidence: 0.8 }],
    );
    expect(
      runHeuristicPhase("text", "standard", [first, second], baseContext, {
        language: "en",
      }).map((c) => c.text),
    ).toEqual(["first", "second"]);
  });

  it("heuristic confidence values are preserved in output", () => {
    const heuristic = makeHeuristic(
      "heuristics.confidence",
      ["en"],
      ["standard"],
      () => [
        { text: "A", ruleId: "heuristics.confidence", confidence: 0.75 },
        { text: "B", ruleId: "heuristics.confidence", confidence: 0.6 },
      ],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }).map((c) => c.confidence),
    ).toEqual([0.75, 0.6]);
  });

  it("empty input text returns [] without calling any heuristic", () => {
    let called = false;
    const heuristic = makeHeuristic(
      "heuristics.never",
      ["en"],
      ["standard"],
      () => {
        called = true;
        return [];
      },
    );
    expect(
      runHeuristicPhase("", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toEqual([]);
    expect(called).toBe(false);
  });

  it("heuristic returning [] is valid", () => {
    const heuristic = makeHeuristic(
      "heuristics.empty",
      ["en"],
      ["standard"],
      () => [],
    );
    expect(
      runHeuristicPhase("text", "standard", [heuristic], baseContext, {
        language: "en",
      }),
    ).toEqual([]);
  });
});

describe("runAllPhases", () => {
  it('empty text returns empty arrays with documentLanguage "en"', () => {
    expect(
      runAllPhases("", {
        level: "standard",
        rules: [],
        parsers: [],
        heuristics: [],
      }),
    ).toEqual({
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    });
  });

  it("text with only regex matches returns candidates and empty structuralDefinitions", () => {
    const rule = makeRule("identifiers.regex", /REGEX/g, ["en"]);
    const result = runAllPhases("REGEX", {
      level: "standard",
      rules: [rule],
      parsers: [],
      heuristics: [],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.structuralDefinitions).toEqual([]);
  });

  it("text with only structural matches populates structuralDefinitions and leaves candidates empty", () => {
    const parser = makeParser("structural.only", ["en"], () => [
      { label: "Buyer", referent: "ABC", source: "definition-section" },
    ]);
    const result = runAllPhases("BUYER", {
      level: "standard",
      rules: [],
      parsers: [parser],
      heuristics: [],
    });
    expect(result.structuralDefinitions).toEqual([
      { label: "Buyer", referent: "ABC", source: "definition-section" },
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("text exercising all three phases returns regex plus heuristic candidates and structural side-channel", () => {
    const parser = makeParser("structural.all", ["en"], () => [
      { label: "Buyer", referent: "ABC", source: "definition-section" },
    ]);
    const rule = makeRule("identifiers.regex", /REGEX/g, ["en"]);
    const heuristic = makeHeuristic(
      "heuristics.all",
      ["en"],
      ["standard"],
      (_text, context) => [
        {
          text: `heur-${context.priorCandidates.length}`,
          ruleId: "heuristics.all",
          confidence: 0.6,
        },
      ],
    );
    const result = runAllPhases("REGEX", {
      level: "standard",
      rules: [rule],
      parsers: [parser],
      heuristics: [heuristic],
    });
    expect(result.structuralDefinitions).toHaveLength(1);
    expect(result.candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.regex",
      "heuristics.all",
    ]);
  });

  it("regex candidates appear before heuristic candidates", () => {
    const rule = makeRule("identifiers.regex", /REGEX/g, ["en"]);
    const heuristic = makeHeuristic(
      "heuristics.after",
      ["en"],
      ["standard"],
      () => [{ text: "heur", ruleId: "heuristics.after", confidence: 0.5 }],
    );
    const result = runAllPhases("REGEX", {
      level: "standard",
      rules: [rule],
      parsers: [],
      heuristics: [heuristic],
    });
    expect(result.candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.regex",
      "heuristics.after",
    ]);
  });

  it("detectLanguage is used when language is omitted and explicit language overrides it", () => {
    const koOnly = makeRule("identifiers.ko-only", /Buyer/g, ["ko"]);
    expect(
      runAllPhases("Buyer", {
        level: "standard",
        rules: [koOnly],
        parsers: [],
        heuristics: [],
      }).candidates,
    ).toEqual([]);
    expect(
      runAllPhases("Buyer", {
        level: "standard",
        language: "ko",
        rules: [koOnly],
        parsers: [],
        heuristics: [],
      }).candidates.map((c) => c.ruleId),
    ).toEqual(["identifiers.ko-only"]);
  });

  it("HeuristicContext passed to phase 3 contains the exact arrays from phases 1 and 2", () => {
    const parser = makeParser("structural.capture", ["en"], () => [
      { label: "Buyer", referent: "ABC", source: "definition-section" },
    ]);
    const rule = makeRule("identifiers.regex", /REGEX/g, ["en"]);
    let captured: HeuristicContext | undefined;
    const heuristic = makeHeuristic(
      "heuristics.capture",
      ["en"],
      ["standard"],
      (_text, context) => {
        captured = context;
        return [{ text: "heur", ruleId: "heuristics.capture", confidence: 0.5 }];
      },
    );
    const result = runAllPhases("REGEX", {
      level: "standard",
      rules: [rule],
      parsers: [parser],
      heuristics: [heuristic],
    });
    expect(captured).toBeDefined();
    expect(captured!.structuralDefinitions).toBe(result.structuralDefinitions);
    expect(captured!.priorCandidates).toHaveLength(1);
    expect(captured!.priorCandidates[0]).toBe(result.candidates[0]);
  });

  it("throwing parser causes the whole runAllPhases call to throw", () => {
    const parser = makeParser("structural.throw", ["en"], () => {
      throw new Error("boom");
    });
    expect(() =>
      runAllPhases("text", {
        level: "standard",
        rules: [],
        parsers: [parser],
        heuristics: [],
      }),
    ).toThrow("boom");
  });

  it("opts.rules, opts.parsers, and opts.heuristics override registry defaults", () => {
    const result = runAllPhases("kim@abc.kr", {
      level: "standard",
      rules: [],
      parsers: [],
      heuristics: [],
    });
    expect(result.candidates).toEqual([]);
    expect(result.structuralDefinitions).toEqual([]);
  });

  it("returns within 1000ms on a 100KB pathological input", () => {
    const start = performance.now();
    const result = runAllPhases("A".repeat(100_000), {
      level: "standard",
      rules: [makeRule("identifiers.none", /ZZZ/g, ["en"])],
      parsers: [],
      heuristics: [],
    });
    const elapsed = performance.now() - start;
    expect(result.candidates).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });
});
