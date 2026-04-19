import type { CategoryResult, ScoringMode } from "../scorer.js";

export function generateSummary(
  score: number,
  grade: string,
  isScanned: boolean,
  categories: CategoryResult[],
  mode: ScoringMode,
): string {
  const profileLead =
    mode === "remediation"
      ? "Practical-readiness profile (includes additional PDF/UA-oriented audits): "
      : "";

  if (isScanned) {
    return `${profileLead}This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required before this document can be made accessible.`;
  }

  const critical = categories.filter((c) => c.severity === "Critical");
  const passing = categories.filter((c) => c.severity === "Pass");
  const applicable = categories.filter((c) => c.score !== null);

  if (grade === "A") {
    return mode === "remediation"
      ? `${profileLead}This PDF is in strong practical shape across all ${applicable.length} assessed categories. Confirm any remaining legal/compliance checks separately.`
      : `This PDF meets accessibility standards across all ${applicable.length} assessed categories. It is ready for publication.`;
  }

  if (grade === "B") {
    return mode === "remediation"
      ? `${profileLead}This PDF is in good practical shape with a few remaining issues. ${passing.length} of ${applicable.length} categories pass in this softer profile. Review the findings below before treating it as compliant.`
      : `This PDF is in good shape with minor issues. ${passing.length} of ${applicable.length} categories pass. Review the findings below for remaining improvements.`;
  }

  const moderate = categories.filter((c) => c.severity === "Moderate");

  if (critical.length > 0 && moderate.length > 0) {
    const criticalNames = critical.map((c) => c.label).join(", ");
    const moderateNames = moderate.map((c) => c.label).join(", ");
    return `${profileLead}This PDF has ${critical.length} critical issue${critical.length > 1 ? "s" : ""} (${criticalNames}) and ${moderate.length} moderate issue${moderate.length > 1 ? "s" : ""} (${moderateNames}). Critical issues must be fixed before publishing, and moderate issues should also be addressed.`;
  }

  if (critical.length > 0) {
    const criticalNames = critical.map((c) => c.label).join(", ");
    return `${profileLead}This PDF has ${critical.length} critical accessibility issue${critical.length > 1 ? "s" : ""}: ${criticalNames}. These must be addressed before publishing.`;
  }

  if (moderate.length > 0) {
    const moderateNames = moderate.map((c) => c.label).join(", ");
    return `${profileLead}This PDF has ${moderate.length} moderate accessibility issue${moderate.length > 1 ? "s" : ""}: ${moderateNames}. These should be addressed to improve accessibility.`;
  }

  return `${profileLead}This PDF has accessibility issues in ${applicable.length - passing.length} of ${applicable.length} categories. Review the findings below and remediate in Adobe Acrobat.`;
}
