import { IDENTIFIERS } from "../detection/rules/identifiers.js";
import { IDENTIFIERS_UK } from "../detection/rules/identifiers-uk.js";

export type IdentifierSubcategory =
  | (typeof IDENTIFIERS)[number]["subcategory"]
  | (typeof IDENTIFIERS_UK)[number]["subcategory"];

export const IDENTIFIER_SUBCATEGORY_TO_KIND = {
  // -- Upstream (KR / US / universal) --
  "korean-rrn": "rrn",
  "korean-brn": "brn",
  "us-ein": "ein",
  "phone-kr": "phone-kr",
  "phone-kr-landline": "phone-kr-landline",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  "credit-card": "card",
  // -- UK --
  "uk-nino": "uk-nino",
  "uk-nhs-number": "uk-nhs-number",
  "uk-phone-domestic": "uk-phone",
  "uk-postcode": "uk-postcode",
  "uk-gmc": "uk-gmc",
  "uk-nmc": "uk-nmc",
  "uk-driving-licence": "uk-driving-licence",
  "uk-hospital-mrn": "uk-hospital-mrn",
  "uk-sort-code": "uk-sort-code",
} as const satisfies Record<IdentifierSubcategory, string>;

export type UiPiiKind =
  (typeof IDENTIFIER_SUBCATEGORY_TO_KIND)[IdentifierSubcategory];

export const PII_KIND_LABELS: Readonly<Record<UiPiiKind, string>> = {
  // -- Upstream --
  rrn: "resident registration number · KR",
  brn: "business registration number · KR",
  ein: "US EIN",
  "phone-kr": "phone · KR",
  "phone-kr-landline": "phone · KR landline",
  "phone-intl": "phone · intl",
  email: "email",
  "account-kr": "bank account · KR",
  card: "credit card",
  // -- UK --
  "uk-nino": "National Insurance number",
  "uk-nhs-number": "NHS number",
  "uk-phone": "phone · UK",
  "uk-postcode": "postcode",
  "uk-gmc": "GMC number",
  "uk-nmc": "NMC PIN",
  "uk-driving-licence": "driving licence",
  "uk-hospital-mrn": "hospital number / MRN",
  "uk-sort-code": "bank sort code",
};

export function piiKindLabel(kind: UiPiiKind): string {
  return PII_KIND_LABELS[kind];
}
