// src/utils/progressiveReview.js
//
// This module owns the entire "live typing" illusion.
//
// CONCEPT:
//   Instead of running all agents then posting one comment at the end, we:
//     1. Create a placeholder comment immediately (before any agent runs).
//     2. Run agents one by one.
//     3. After each agent finishes, append its section to the comment body
//        and call updatePRComment so GitHub users see the comment grow.
//     4. Add a short delay between updates so the growth is visible.
//
// WHY A SEPARATE MODULE:
//   webhook.js was already complex. Pulling the staged-update logic here keeps
//   each file focused on one responsibility and makes the stages easy to
//   reorder, add to, or remove without touching the webhook router.

import { createPRComment, updatePRComment } from "../services/githubService.js";
import { reviewPR }          from "../agents/prReviewAgent.js";
import { analyzeSecurity }   from "../agents/securityAgent.js";
import { analyzePerformance } from "../agents/performanceAgent.js";
import { analyzeStyle }      from "../agents/styleAgent.js";
import { analyzeRisk }       from "../agents/riskAgent.js";
import { generateTests }     from "../agents/testCaseAgent.js";

// How long (ms) to wait between comment updates.
// 1500 ms gives a comfortable "typing" cadence without feeling sluggish.
const UPDATE_DELAY = 1500;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
//
// Each function takes the raw agent output and returns a markdown string.
// Returning an empty string means "nothing to show" — the caller skips
// the update entirely so the comment doesn't flash with empty sections.
// ─────────────────────────────────────────────────────────────────────────────

function buildSummarySection(review) {
  if (!review?.summary) return "";
  return `### Summary\n\n${review.summary}`;
}

function buildRiskSection(risk) {
  if (!risk?.risk_score) return "";

  const score = risk.risk_score;

  // Derive a text label from the numeric score (assumes 1-10 scale).
  const label =
    score >= 8 ? "High" :
    score >= 5 ? "Medium" : "Low";

  const bar = buildRiskBar(score);

  return [
    `### Risk Overview`,
    ``,
    `| Score | Level | Assessment |`,
    `|-------|-------|------------|`,
    `| ${score}/10 | ${label} | ${risk.reason ?? "—"} |`,
    ``,
    `\`${bar}\``
  ].join("\n");
}

function buildRiskBar(score) {
  // Visual 1–10 bar using block characters, e.g. "████████░░ 8/10"
  const filled = Math.round(Math.max(0, Math.min(10, score)));
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${score}/10`;
}

function buildFindingsSection(review, security, performance) {
  const parts = [];

  // Bugs
  const bugs = review?.bugs ?? [];
  if (bugs.length) {
    parts.push(`**Bugs**\n${bugs.map(b => `- ${b}`).join("\n")}`);
  }

  // Security
  const findings = security?.security_findings ?? [];
  if (findings.length) {
    const lines = findings.map(f => {
      if (typeof f === "string") return `- ${f}`;
      const sev = f.severity ? `\`${f.severity.toUpperCase()}\`` : "";
      return `- ${sev} ${f.issue}`;
    });
    parts.push(`**Security**\n${lines.join("\n")}`);
  }

  // Performance
  const perf = performance?.performance_issues ?? [];
  if (perf.length) {
    const lines = perf.map(p => {
      if (typeof p === "string") return `- ${p}`;
      return `- ${p.issue}`;
    });
    parts.push(`**Performance**\n${lines.join("\n")}`);
  }

  if (!parts.length) return "";
  return `### Key Findings\n\n${parts.join("\n\n")}`;
}

function buildFixesSection(review, security, performance, style) {
  const parts = [];

  // Improvements from review agent
  const improvements = review?.improvements ?? [];
  if (improvements.length) {
    parts.push(`**General**\n${improvements.map(i => `- ${i}`).join("\n")}`);
  }

  // Security fixes
  const findings = security?.security_findings ?? [];
  const secFixes = findings.filter(f => f.fix);
  if (secFixes.length) {
    const lines = secFixes.map(f =>
      `- ${f.issue ? `${f.issue} —` : ""} ${f.fix}`
    );
    parts.push(`**Security Fixes**\n${lines.join("\n")}`);
  }

  // Performance fixes
  const perf = performance?.performance_issues ?? [];
  const perfFixes = perf.filter(p => p.fix);
  if (perfFixes.length) {
    const lines = perfFixes.map(p =>
      `- ${p.issue ? `${p.issue} —` : ""} ${p.fix}`
    );
    parts.push(`**Performance Fixes**\n${lines.join("\n")}`);
  }

  // Style suggestions
  const suggestions = style?.style_suggestions ?? [];
  if (suggestions.length) {
    const lines = suggestions.map(s => {
      if (typeof s === "string") return `- ${s}`;
      return `- ${s.issue ?? s.suggestion ?? JSON.stringify(s)}`;
    });
    parts.push(`**Style**\n${lines.join("\n")}`);
  }

  if (!parts.length) return "";
  return `### Recommended Fixes\n\n${parts.join("\n\n")}`;
}

function buildTestsSection(tests) {
  const list = tests?.tests ?? [];
  if (!list.length) return "";

  const blocks = list.map(t =>
    `**\`${t.function_name}\`**\n\`\`\`js\n${t.test_code.trim()}\n\`\`\``
  );
  return `### Suggested Tests\n\n${blocks.join("\n\n")}`;
}

function buildAutoFixSection() {
  return [
    `### Auto-Fix Available`,
    ``,
    `Add the \`apply-ai-fixes\` label to this pull request to have RepoSpace`,
    `automatically generate and commit code fixes for the issues listed above.`
  ].join("\n");
}

function buildFooter(totalIssues) {
  const issueText = totalIssues > 0
    ? `${totalIssues} issue${totalIssues === 1 ? "" : "s"} found.`
    : "No critical issues found.";
  return `---\n*${issueText} Reviewed by RepoSpace AI.*`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment body assembler
//
// Takes all sections collected so far and assembles the full comment body.
// Sections that are empty strings are filtered out so we never get blank
// headings in the comment mid-stream.
// ─────────────────────────────────────────────────────────────────────────────

function assembleBody(sections) {
  return [
    `## AI Code Review`,
    ...sections
  ]
    .filter(s => s && s.trim() !== "")
    .join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — runProgressiveReview
//
// Orchestrates the full pipeline for a single file diff.
// Returns nothing — all output goes to GitHub via comment updates.
//
// @param {string} repo
// @param {number} prNumber
// @param {string} diff  — the file diff to analyse
// ─────────────────────────────────────────────────────────────────────────────

export async function runProgressiveReview(repo, prNumber, diff) {

  // Collect sections as they are built so we can append incrementally.
  const liveSections = [];

  // ── Step 0: Post the placeholder ────────────────────────────────────────
  const placeholderBody = assembleBody([
    "_RepoSpace AI is analyzing this pull request..._"
  ]);

  let commentId;
  try {
    commentId = await createPRComment(repo, prNumber, placeholderBody);
    console.log(`[progressive] Placeholder comment created (id: ${commentId})`);
  } catch (err) {
    console.error("[progressive] Failed to create placeholder comment:", err.message);
    return;
  }

  // Helper: append a new section to the live comment.
  // Skips silently if the section is empty (agent returned nothing useful).
  async function pushSection(sectionMarkdown) {
    if (!sectionMarkdown || sectionMarkdown.trim() === "") return;
    liveSections.push(sectionMarkdown);
    const body = assembleBody(liveSections);
    try {
      await updatePRComment(repo, commentId, body);
    } catch (err) {
      console.error("[progressive] Comment update failed:", err.message);
      // Non-fatal — keep going. The next update will contain this section anyway.
    }
    await sleep(UPDATE_DELAY);
  }

  // ── Step 1: PR review agent → Summary ───────────────────────────────────
  console.log("[progressive] Running PR review agent...");
  const review = await reviewPR(diff).catch(err => {
    console.error("[progressive] reviewPR failed:", err.message);
    return null;
  });

  await pushSection(buildSummarySection(review));

  // ── Step 2: Risk agent → Risk Overview ──────────────────────────────────
  console.log("[progressive] Running risk agent...");
  const risk = await analyzeRisk(diff).catch(err => {
    console.error("[progressive] analyzeRisk failed:", err.message);
    return null;
  });

  await pushSection(buildRiskSection(risk));

  // ── Step 3: Security + Performance agents → Key Findings ────────────────
  // Run both in parallel — they are independent and this halves the wait time.
  console.log("[progressive] Running security + performance agents...");
  const [security, performance] = await Promise.allSettled([
    analyzeSecurity(diff),
    analyzePerformance(diff)
  ]).then(results =>
    results.map(r => r.status === "fulfilled" ? r.value : null)
  );

  await pushSection(buildFindingsSection(review, security, performance));

  // ── Step 4: Style agent → Recommended Fixes ─────────────────────────────
  console.log("[progressive] Running style agent...");
  const style = await analyzeStyle(diff).catch(err => {
    console.error("[progressive] analyzeStyle failed:", err.message);
    return null;
  });

  await pushSection(buildFixesSection(review, security, performance, style));

  // ── Step 5: Test agent → Suggested Tests ────────────────────────────────
  console.log("[progressive] Running test agent...");
  const tests = await generateTests(diff).catch(err => {
    console.error("[progressive] generateTests failed:", err.message);
    return null;
  });

  if (tests) await pushSection(buildTestsSection(tests));

  // ── Step 6: Auto-fix callout ─────────────────────────────────────────────
  await pushSection(buildAutoFixSection());

  // ── Step 7: Final footer ─────────────────────────────────────────────────
  const totalIssues =
    (review?.bugs?.length ?? 0) +
    (security?.security_findings?.length ?? 0) +
    (performance?.performance_issues?.length ?? 0);

  await pushSection(buildFooter(totalIssues));

  console.log(`[progressive] Review complete. ${liveSections.length} sections posted.`);
}