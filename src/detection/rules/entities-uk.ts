/**
 * UK entities -- NHS Trusts, legal professional titles, medical
 * professional titles, and UK-specific context labels.
 *
 * These are particularly important for clinical negligence and inquest
 * documents where healthcare organisations and medical professionals
 * are named throughout.
 *
 * See:
 *   - docs/RULES_GUIDE.md SS 7 -- ReDoS checklist
 *   - docs/RULES_GUIDE.md SS 12.2 -- hardcoded entity names anti-pattern
 */

import type { RegexRule } from "../_framework/types.js";

export const ENTITIES_UK = [
  // -- 1. NHS Trust / Health Body -------------------------------------------------
  {
    id: "entities.uk-nhs-trust",
    category: "entities",
    subcategory: "uk-nhs-trust",
    pattern:
      /(?<![A-Za-z])[A-Z][A-Za-z&\-']*(?:\s+[A-Z][A-Za-z&\-']*){0,6}\s+(?:NHS\s+(?:Foundation\s+)?Trust|Health\s+Board|(?:Integrated\s+Care\s+Board|ICB)|Health\s+Authority)(?![A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK NHS organisation -- matches both 'NHS Trust' and 'NHS Foundation " +
      "Trust', plus Health Boards (Wales), ICBs, and Health Authorities. " +
      "E.g., 'Barts Health NHS Trust', 'Royal Devon University Healthcare " +
      "NHS Foundation Trust', 'Betsi Cadwaladr University Health Board'",
  },

  // -- 2. UK Legal Professional Titles + Name -------------------------------------
  {
    id: "entities.uk-legal-title",
    category: "entities",
    subcategory: "uk-legal-title",
    pattern:
      /(?<![A-Za-z])(?:(?:His|Her)\s+Honou?r\s+Judge|(?:Mrs?|Lady|Lord)\s+Justice|(?:Master|Senior Master|Registrar|District Judge|Deputy (?:District )?Judge|Recorder|Coroner|(?:HH|HHJ|DJ|DDJ))\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?![A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK judicial and legal professional title + name (His Honour Judge " +
      "Smith, Mrs Justice Andrews, District Judge Patel, Coroner Williams, " +
      "HHJ Taylor)",
  },

  // -- 3. KC / QC Designation + Name ----------------------------------------------
  {
    id: "entities.uk-kings-counsel",
    category: "entities",
    subcategory: "uk-kings-counsel",
    pattern:
      /(?<![A-Za-z])[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:KC|QC)(?![A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Name followed by KC or QC (King's/Queen's Counsel designation)",
  },

  // -- 4. Medical Professional Titles + Name (clinical negligence) ----------------
  {
    id: "entities.uk-medical-title",
    category: "entities",
    subcategory: "uk-medical-title",
    pattern:
      /(?<![A-Za-z])(?:(?:Consultant|Registrar|SHO|Staff\s+Nurse|Sister|Charge\s+Nurse|Matron|Midwife|Health\s+Visitor|Specialist\s+Nurse|Nurse\s+Practitioner|Physiotherapist|Radiologist|Pathologist|Anaesthetist|Surgeon|Psychiatrist|Paediatrician|Obstetrician|Gynaecologist)\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?![A-Za-z])/g,
    levels: ["paranoid"],
    languages: ["en"],
    description:
      "UK medical/nursing professional title + name (Consultant Smith, " +
      "Staff Nurse Patel, Midwife Jones). Paranoid tier -- medical role " +
      "titles are sometimes generic references, not names",
  },

  // -- 5. UK Medical Record Context Labels ----------------------------------------
  {
    id: "entities.uk-medical-context",
    category: "entities",
    subcategory: "uk-medical-context",
    pattern:
      /(?<=(?:Patient|Patient Name|D\.?O\.?B|Date of Birth|Date of Death|DOD|Next of Kin|NOK|GP|General Practitioner|Referring Clinician|Consultant|Ward|Specialty)\s*:\s*)[^\n;]{2,80}(?=$|\n|;)/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Value following a UK medical record label (Patient:/D.O.B:/GP:/" +
      "Ward:/Consultant:). Catches names, dates, and identifiers in " +
      "structured medical record headers",
  },

  // -- 6. Inquest-Specific Context ------------------------------------------------
  {
    id: "entities.uk-inquest-context",
    category: "entities",
    subcategory: "uk-inquest-context",
    pattern:
      /(?<=(?:(?:Touching|Into)\s+the\s+death\s+of|Deceased|The (?:late|deceased))\s*:?\s*)[A-Z][A-Za-z\-']+(?:\s+[A-Z][A-Za-z\-']+){0,3}(?![a-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Name of deceased in inquest documents (following 'touching the " +
      "death of', 'Deceased:', 'The late')",
  },
] as const satisfies readonly RegexRule[];
