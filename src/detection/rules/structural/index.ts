/**
 * Structural parsers aggregator.
 *
 * Re-exports every StructuralParser in this directory as a single
 * `ALL_STRUCTURAL_PARSERS` array. This array is consumed by
 * `_framework/registry.ts` to populate the runner's default parser list.
 *
 * Parser order matters: downstream heuristics iterate this array and
 * later parsers' definitions can shadow earlier ones if the label is
 * identical. Current order is definition-section first (most authoritative)
 * then party-declaration, recitals, signature-block, header-block.
 */

import type { StructuralParser } from "../../_framework/types.js";

import { DEFINITION_SECTION } from "./definition-section.js";
import { HEADER_BLOCK } from "./header-block.js";
import { PARTY_DECLARATION } from "./party-declaration.js";
import { RECITALS } from "./recitals.js";
import { SIGNATURE_BLOCK } from "./signature-block.js";

export const ALL_STRUCTURAL_PARSERS: readonly StructuralParser[] = [
  DEFINITION_SECTION,
  PARTY_DECLARATION,
  RECITALS,
  SIGNATURE_BLOCK,
  HEADER_BLOCK,
] as const;
