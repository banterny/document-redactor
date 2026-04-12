/**
 * Heuristics aggregator.
 *
 * Re-exports every Heuristic in this directory as a single
 * `ALL_HEURISTICS` array. Consumed by `_framework/registry.ts`.
 *
 * Heuristic order: capitalization-cluster first (highest confidence
 * among the generic heuristics), then quoted-term, repeatability,
 * email-domain-inference. Order matters because later heuristics see
 * earlier heuristics' candidates in the same phase — but since all
 * heuristics receive the same HeuristicContext (snapshot before the
 * phase starts), cross-heuristic ordering is actually observationally
 * irrelevant. The order is cosmetic for determinism only.
 */

import type { Heuristic } from "../../_framework/types.js";

import { CAPITALIZATION_CLUSTER } from "./capitalization-cluster.js";
import { EMAIL_DOMAIN_INFERENCE } from "./email-domain-inference.js";
import { QUOTED_TERM } from "./quoted-term.js";
import { REPEATABILITY } from "./repeatability.js";

export const ALL_HEURISTICS: readonly Heuristic[] = [
  CAPITALIZATION_CLUSTER,
  QUOTED_TERM,
  REPEATABILITY,
  EMAIL_DOMAIN_INFERENCE,
] as const;
