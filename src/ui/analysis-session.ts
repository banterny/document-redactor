import type { ExtractedScopeText } from "../detection/extract-text.js";
import { extractTextFromZip } from "../detection/extract-text.js";
import { loadDocxZip } from "../docx/load.js";
import {
  renderDocumentBody,
  type RenderedDocument,
} from "../docx/render-body.js";
import { listScopes } from "../docx/scopes.js";
import {
  collectVerifySurfaces,
  type VerifySurfaces,
} from "../docx/verify-surfaces.js";
import type { Analysis, FileStats } from "./engine.js";

export interface DocumentAnalysisSnapshot {
  readonly bytes: Uint8Array;
  readonly fileStats: FileStats;
  readonly scopedText: readonly ExtractedScopeText[];
  readonly renderedDoc: Promise<RenderedDocument>;
  readonly verifySurfaces: VerifySurfaces;
}

export interface DocumentAnalysisSession extends DocumentAnalysisSnapshot {
  readonly analysis: Analysis;
}

export async function createDocumentAnalysisSnapshot(
  bytes: Uint8Array,
): Promise<DocumentAnalysisSnapshot> {
  const zip = await loadDocxZip(bytes);
  const fileStats: FileStats = {
    sizeBytes: bytes.length,
    scopeCount: listScopes(zip).length,
  };
  const renderedDoc = renderDocumentBody(zip);
  // Preview errors are rendered in the UI; analysis should still complete.
  renderedDoc.catch(() => undefined);

  const [scopedText, verifySurfaces] = await Promise.all([
    extractTextFromZip(zip),
    collectVerifySurfaces(zip),
  ]);

  return {
    bytes,
    fileStats,
    scopedText,
    renderedDoc,
    verifySurfaces,
  };
}

export function attachAnalysisToSession(
  snapshot: DocumentAnalysisSnapshot,
  analysis: Analysis,
): DocumentAnalysisSession {
  return { ...snapshot, analysis };
}

export function replaceSessionAnalysis(
  session: DocumentAnalysisSession,
  analysis: Analysis,
): DocumentAnalysisSession {
  return { ...session, analysis };
}
