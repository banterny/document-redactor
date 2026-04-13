/**
 * Document body renderer — converts a loaded JSZip into a flat structure
 * suitable for UI rendering.
 *
 * Iterates every text-bearing scope via `listScopes`, reads each scope's XML
 * via `readScopeXml`, splits on paragraph boundaries (same regex the
 * extract-text module uses), and runs each paragraph through
 * `coalesceParagraphRuns` to extract its logical text.
 *
 * Output is a RenderedDocument — ordered scopes, each with ordered paragraphs.
 * Formatting (bold, italic, headings, tables) is NOT preserved; every
 * paragraph is a flat string. Table cells flatten to top-level paragraphs
 * within the containing scope.
 */

import type JSZip from "jszip";

import { coalesceParagraphRuns } from "./coalesce.js";
import { listScopes, readScopeXml } from "./scopes.js";
import type { Scope } from "./types.js";

export interface RenderedParagraph {
  readonly scopeIndex: number;
  readonly text: string;
}

export interface RenderedScope {
  readonly scope: Scope;
  readonly paragraphs: readonly RenderedParagraph[];
}

export interface RenderedDocument {
  readonly scopes: readonly RenderedScope[];
}

const PARAGRAPH_RE =
  /<w:p(?!P|r)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g;

export async function renderDocumentBody(
  zip: JSZip,
): Promise<RenderedDocument> {
  const scopes: RenderedScope[] = [];

  for (const scope of listScopes(zip)) {
    const xml = await readScopeXml(zip, scope);
    const paragraphs: RenderedParagraph[] = [];
    const re = new RegExp(PARAGRAPH_RE.source, PARAGRAPH_RE.flags);

    let match: RegExpExecArray | null;
    let scopeIndex = 0;
    while ((match = re.exec(xml)) !== null) {
      const { text } = coalesceParagraphRuns(match[0]);
      paragraphs.push({ scopeIndex, text });
      scopeIndex += 1;
    }

    scopes.push({ scope, paragraphs });
  }

  return { scopes };
}
