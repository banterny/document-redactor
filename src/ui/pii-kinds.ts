import { IDENTIFIERS } from "../detection/rules/identifiers.js";

export type IdentifierSubcategory =
  (typeof IDENTIFIERS)[number]["subcategory"];

export const IDENTIFIER_SUBCATEGORY_TO_KIND = {
  "korean-rrn": "rrn",
  "korean-brn": "brn",
  "us-ein": "ein",
  "phone-kr": "phone-kr",
  "phone-kr-landline": "phone-kr-landline",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  "credit-card": "card",
} as const satisfies Record<IdentifierSubcategory, string>;

export type UiPiiKind =
  (typeof IDENTIFIER_SUBCATEGORY_TO_KIND)[IdentifierSubcategory];

export const PII_KIND_LABELS: Readonly<Record<UiPiiKind, string>> = {
  rrn: "주민등록번호",
  brn: "사업자등록번호",
  ein: "US EIN",
  "phone-kr": "phone · KR",
  "phone-kr-landline": "phone · KR landline",
  "phone-intl": "phone · intl",
  email: "email",
  "account-kr": "bank account · KR",
  card: "credit card",
};

export function piiKindLabel(kind: UiPiiKind): string {
  return PII_KIND_LABELS[kind];
}
