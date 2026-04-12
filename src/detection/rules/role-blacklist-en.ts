/**
 * English role-word blacklist — 50 tokens that appear heavily in legal
 * documents but are NOT sensitive entity names.
 *
 * All entries are LOWERCASE. Heuristics compare against this set after
 * lowering the candidate: `ROLE_BLACKLIST_EN.has(candidate.toLowerCase())`.
 *
 * Consumed by every English-language heuristic. Same maintenance rules
 * as the Korean blacklist.
 */

export const ROLE_BLACKLIST_EN: ReadonlySet<string> = new Set([
  "party", "parties", "plaintiff", "defendant",
  "claimant", "respondent", "appellant", "appellee",
  "client", "customer", "company", "corporation",
  "individual", "person", "entity", "agent",
  "representative", "attorney", "counsel", "lawyer",
  "licensor", "licensee", "franchisor", "franchisee",
  "lessor", "lessee", "landlord", "tenant",
  "buyer", "seller", "purchaser", "vendor",
  "creditor", "debtor", "guarantor", "surety",
  "assignor", "assignee", "transferor", "transferee",
  "employer", "employee", "contractor", "subcontractor",
  "principal", "trustee", "beneficiary", "fiduciary",
  "discloser", "recipient",
]) as ReadonlySet<string>;
