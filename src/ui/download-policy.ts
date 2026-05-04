export type DownloadPolicyKind = "strictClean" | "warning" | "risk";

export function canDownloadReport(
  kind: DownloadPolicyKind,
  residualRiskAcknowledged = false,
): boolean {
  switch (kind) {
    case "strictClean":
    case "warning":
      return true;
    case "risk":
      return residualRiskAcknowledged;
  }
}

export function redactedFilename(
  original: string,
  options: { readonly unverified?: boolean } = {},
): string {
  const marker = options.unverified === true ? ".UNVERIFIED.redacted" : ".redacted";
  const dot = original.lastIndexOf(".");
  if (dot === -1) return `${original}${marker}`;
  return `${original.slice(0, dot)}${marker}${original.slice(dot)}`;
}
