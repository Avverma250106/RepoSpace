// src/server/webhook.js

import {
  getPRDiff,
  postPRComment,
  getPRFiles,
  getFileContent,
  updateFile,
  getLatestCommitSha
} from "../services/githubService.js";

import { runProgressiveReview } from "../utils/progressiveReview.js";
import { generateFix } from "../agents/fixAgent.js";
import { openCommitInBrave } from "../browser/commitViewer.js";
import { postInlineReview } from "../utils/postInlineReview.js";

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 1 — Progressive PR review
// ─────────────────────────────────────────────────────────────────────────────

function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}

async function handlePRReview(repo, prNumber) {
  console.log(`[review] Starting review for PR #${prNumber} in ${repo}`);

  let diff;
  try {
    diff = await getPRDiff(repo, prNumber);
  } catch (err) {
    console.error("[review] Failed to fetch diff:", err.message);
    return;
  }

  if (diff.length > 15000) {
    console.log("[review] PR diff too large — skipping.");
    return;
  }

  const filesToReview = splitDiffByFile(diff)
    .filter(f => f.length <= 5000)
    .slice(0, 3);

  if (!filesToReview.length) {
    console.log("[review] No reviewable files.");
    return;
  }

  // Existing progressive review
  for (const file of filesToReview) {
    await runProgressiveReview(repo, prNumber, file);
  }

  // NEW: Post inline comments directly on changed lines
  try {
    await postInlineReview(repo, prNumber, diff);
    console.log("[review] Inline comments posted.");
  } catch (err) {
    console.error("[review] Inline review failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 2 — Auto-fix
// After each commit: get the SHA, open it in Brave via Playwright.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FIX_FILES = 3;

const FIXABLE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go",
  ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".rs",
  ".kt", ".swift", ".sh", ".yaml", ".yml", ".json"
]);

const BLOCKED_FILENAMES = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Gemfile.lock", "poetry.lock", "go.sum", "Cargo.lock"
];

function isFixableFile(filename) {
  if (BLOCKED_FILENAMES.some(b => filename.endsWith(b))) return false;
  const ext = filename.slice(filename.lastIndexOf("."));
  return FIXABLE_EXTENSIONS.has(ext);
}

export async function handleAutoFix(repo, prNumber, branch) {
  console.log(`[autofix] Starting for PR #${prNumber} on branch "${branch}"`);

  let changedFiles;
  try {
    changedFiles = await getPRFiles(repo, prNumber);
  } catch (err) {
    console.error("[autofix] Failed to fetch PR files:", err.message);
    return;
  }

  const filesToFix = changedFiles
    .filter(f => f.status !== "removed")
    .filter(f => isFixableFile(f.filename))
    .filter(f => f.patch)
    .slice(0, MAX_FIX_FILES);

  if (!filesToFix.length) {
    await postPRComment(repo, prNumber, "## Auto-Fix\n\nNo fixable source files found.");
    return;
  }

  const appliedFixes = [];
  const skippedFiles = [];

  for (const file of filesToFix) {
    const { filename, patch, sha: blobSha } = file;
    console.log(`[autofix] Processing ${filename}…`);

    let fileContent;
    try {
      fileContent = await getFileContent(repo, filename, branch);
    } catch (err) {
      skippedFiles.push({ filename, reason: "Could not fetch file content." });
      continue;
    }

    let fix;
    try {
      fix = await generateFix({ filename, patch, fileContent });
    } catch (err) {
      skippedFiles.push({ filename, reason: "Fix agent error." });
      continue;
    }

    if (!fix) {
      skippedFiles.push({ filename, reason: "No actionable fix found." });
      continue;
    }

    const { fixed_file, reason } = fix;

    if (!fixed_file || !reason) {
      skippedFiles.push({ filename, reason: "Incomplete fix returned." });
      continue;
    }

    const updatedContent = fixed_file;

    // Skip if the generated file is identical to the current file
    if (updatedContent.trim() === fileContent.trim()) {
      skippedFiles.push({ filename, reason: "No changes generated." });
      continue;
    }

    try {
      await updateFile(
        repo, filename, updatedContent,
        `Apply AI-generated fixes\n\n- ${filename}: ${reason}`,
        branch, blobSha
      );

      console.log(`[autofix] Committed fix for ${filename}`);

      // Get the SHA of the commit we just pushed and open it in Brave.
      // openCommitInBrave is non-blocking — the loop continues while Brave opens.
      const commitSha = await getLatestCommitSha(repo, branch);
      openCommitInBrave(repo, commitSha, filename);

      appliedFixes.push({ filename, reason });

    } catch (err) {
      const status = err.response?.status;
      const msg = status === 409
        ? "Concurrent conflict — re-apply the label to retry."
        : err.message;
      console.error(`[autofix] Commit failed for ${filename}:`, msg);
      skippedFiles.push({ filename, reason: `Commit failed: ${msg}` });
    }
  }

  // Post summary comment
  const fixLines = appliedFixes.map(f => `- \`${f.filename}\` — ${f.reason}`);
  const skipLines = skippedFiles.map(f => `- \`${f.filename}\` — ${f.reason}`);

  const body = [
    "## Auto-Fix Results",
    "",
    appliedFixes.length
      ? `### Applied (${appliedFixes.length})\n${fixLines.join("\n")}`
      : "### No fixes were applied.",
    "",
    skippedFiles.length ? `### Skipped\n${skipLines.join("\n")}` : "",
    "",
    "---",
    "_Generated by RepoSpace AI. Review AI commits before merging._"
  ].filter(Boolean).join("\n");

  try {
    await postPRComment(repo, prNumber, body);
  } catch (err) {
    console.error("[autofix] Failed to post summary:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export default async function webhookHandler(req, res) {
  const event = req.headers["x-github-event"];
  const payload = req.body;

  if (
    event === "pull_request" &&
    (payload.action === "opened" || payload.action === "synchronize" || payload.action === "reopened")
  ) {
    res.sendStatus(200);
    const repo = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    try { await handlePRReview(repo, prNumber); }
    catch (err) { console.error("[webhook] Review error:", err.message); }
    return;
  }

  if (
    event === "pull_request" &&
    payload.action === "labeled" &&
    payload.label?.name === "apply-ai-fixes"
  ) {
    res.sendStatus(200);
    const repo = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    const branch = payload.pull_request.head.ref;
    console.log(`[webhook] apply-ai-fixes label on PR #${prNumber}`);
    try { await handleAutoFix(repo, prNumber, branch); }
    catch (err) { console.error("[webhook] Autofix error:", err.message); }
    return;
  }

  res.sendStatus(200);
}