// Replace the entire formatReview function with this concise version.

export function formatReview(reviews) {
  const normalize = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const uniqueStrings = (items) => {
    const seen = new Set();
    const result = [];

    for (const item of items || []) {
      if (!item) continue;

      const value = String(item).trim();
      const key = normalize(value);

      if (!value || seen.has(key)) continue;

      seen.add(key);
      result.push(value);
    }

    return result;
  };

  const extractSeverity = (text) => {
    const match = String(text).match(/\[(critical|high|medium|low)\]/i);
    return match ? match[1].toUpperCase() : "MEDIUM";
  };

  const severityOrder = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
  };

  const sortBySeverity = (items) =>
    [...items].sort(
      (a, b) =>
        severityOrder[extractSeverity(a)] -
        severityOrder[extractSeverity(b)]
    );

  const summaries = [];
  const bugs = [];
  const improvements = [];
  const securityFindings = [];

  for (const r of reviews) {
    if (r.summary) summaries.push(r.summary);
    if (Array.isArray(r.bugs)) bugs.push(...r.bugs);
    if (Array.isArray(r.improvements)) improvements.push(...r.improvements);
    if (Array.isArray(r.security_issues)) {
      securityFindings.push(...r.security_issues);
    }
  }

  const summary =
    uniqueStrings(summaries)[0] || "No major concerns detected.";

  const allIssues = sortBySeverity(
    uniqueStrings([...bugs, ...securityFindings])
  );

  const topIssues = allIssues.slice(0, 8);
  const topFixes = uniqueStrings(improvements).slice(0, 6);

  const count = (severity) =>
    topIssues.filter(
      (issue) => extractSeverity(issue) === severity
    ).length;

  const sections = [];

  sections.push("## AI Code Review");
  sections.push(summary);

  if (topIssues.length > 0) {
    sections.push(
      [
        "### Risk Overview",
        `- Critical: ${count("CRITICAL")}`,
        `- High: ${count("HIGH")}`,
        `- Medium: ${count("MEDIUM")}`,
        `- Low: ${count("LOW")}`
      ].join("\n")
    );

    sections.push(
      "### Key Findings\n" +
        topIssues.map((issue) => `- ${issue}`).join("\n")
    );
  }

  if (topFixes.length > 0) {
    sections.push(
      "### Recommended Fixes\n" +
        topFixes.map((fix) => `- ${fix}`).join("\n")
    );
  }

  if (topIssues.length > 0) {
    sections.push(
      "### Auto-Fix Available\n" +
        "Add the label `apply-ai-fixes` to automatically apply safe fixes."
    );
  }

  sections.push("---\nReviewed by RepoSpace AI");

  return sections.join("\n\n");
}