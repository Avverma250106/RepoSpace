// src/server/webhook.js

import {
  getPRDiff,
  postPRComment,
  getPRFiles,
  getFileContent,
  updateFile
} from "../services/githubService.js";

import { formatReview }      from "../utils/formatter.js";
import { runReviewPipeline } from "../orchestrator/reviewPipeline.js";
import { generateFix }       from "../agents/fixAgent.js";


/**
 * Splits a full repository diff into per-file diffs.
 */
function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}


async function handlePRReview(repo, prNumber) {
  console.log(`[review] Starting review for PR #${prNumber} in ${repo}`);

  const diff = await getPRDiff(repo, prNumber);

  const MAX_TOTAL_DIFF_LENGTH = 15000;
  if (diff.length > MAX_TOTAL_DIFF_LENGTH) {
    console.log("[review] PR diff too large — skipping AI review.");
    return;
  }

  const files = splitDiffByFile(diff);

  const MAX_FILES    = 3;
  const MAX_FILE_LEN = 5000;

  const filesToReview = files.slice(0, MAX_FILES);
  const reviews = [];

  for (const file of filesToReview) {
    if (file.length > MAX_FILE_LEN) {
      console.log("[review] Skipping large file chunk.");
      continue;
    }

    const result = await runReviewPipeline(file);

    if (!result) {
      console.log("[review] Pipeline returned nothing for this file.");
      continue;
    }

    if (result.risk) {
      console.log(`[review] Risk score: ${result.risk.risk_score}`);
    }

    if (result.review) {
      reviews.push(result.review);
    } else {
      console.log("[review] Review agent returned null.");
    }
  }

  if (reviews.length === 0) {
    console.log("[review] No files produced reviews.");
    return;
  }

  const comment = formatReview(reviews);
  await postPRComment(repo, prNumber, comment);
  console.log(`[review] Review comment posted to PR #${prNumber}.`);
}


const MAX_FIX_FILES = 3;

const FIXABLE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx",
  ".py", ".java", ".go", ".rb",
  ".php", ".cs", ".cpp", ".c",
  ".h", ".rs", ".kt", ".swift",
  ".sh", ".yaml", ".yml", ".json"
]);

const BLOCKED_FILENAMES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Gemfile.lock",
  "poetry.lock",
  "go.sum",
  "Cargo.lock"
];

function isFixableFile(filename) {
  if (BLOCKED_FILENAMES.some(b => filename.endsWith(b))) return false;
  const ext = filename.slice(filename.lastIndexOf("."));
  return FIXABLE_EXTENSIONS.has(ext);
}

export async function handleAutoFix(repo, prNumber, branch) {
  console.log(`[autofix] Starting auto-fix for PR #${prNumber} on branch "${branch}"`);

  // ── Step 1: Get the list of changed files ────────────────────────────────
  let changedFiles;
  try {
    changedFiles = await getPRFiles(repo, prNumber);
  } catch (err) {
    console.error("[autofix] Failed to fetch PR files:", err.message);
    return;
  }

  const filesToFix = changedFiles
    .filter(f => f.status !== "removed")   // can't fix deleted files
    .filter(f => isFixableFile(f.filename))
    .filter(f => f.patch)                   // must have a diff to analyse
    .slice(0, MAX_FIX_FILES);

  if (filesToFix.length === 0) {
    console.log("[autofix] No fixable files found in this PR.");
    await postPRComment(
      repo, prNumber,
      "## AI Auto-Fix\n\nNo fixable source files were found in this pull request."
    );
    return;
  }

  const appliedFixes = [];
  const skippedFiles = [];

  for (const file of filesToFix) {
    const { filename, patch, sha: blobSha } = file;
    console.log(`[autofix] Processing ${filename} …`);

    let fileContent;
    try {
      fileContent = await getFileContent(repo, filename, branch);
    } catch (err) {
      console.warn(`[autofix] Could not fetch content for ${filename}: ${err.message}`);
      skippedFiles.push({ filename, reason: "Could not fetch file content." });
      continue;
    }

    let fix;
    try {
      fix = await generateFix({ filename, patch, fileContent });
    } catch (err) {
      console.error(`[autofix] Fix agent threw for ${filename}:`, err.message);
      skippedFiles.push({ filename, reason: "Fix agent error." });
      continue;
    }

    if (!fix) {
      console.log(`[autofix] No fix generated for ${filename}.`);
      skippedFiles.push({ filename, reason: "No actionable fix found." });
      continue;
    }

    const { original_code, fixed_code, reason } = fix;

    if (!original_code || !fixed_code) {
      console.warn(`[autofix] Skipping ${filename} — fix has empty original_code or fixed_code.`);
      skippedFiles.push({ filename, reason: "Fix agent returned incomplete fix." });
      continue;
    }

    if (!fileContent.includes(original_code)) {
      console.warn(`[autofix] original_code not found in ${filename} — skipping.`);
      skippedFiles.push({ filename, reason: "Fix snippet not found in file (possible hallucination)." });
      continue;
    }

    const updatedContent = fileContent.replace(original_code, fixed_code);

    if (updatedContent === fileContent) {
      console.warn(`[autofix] Replace produced no change for ${filename} — skipping commit.`);
      skippedFiles.push({ filename, reason: "Replace operation produced no change." });
      continue;
    }

    try {
      await updateFile(
        repo,
        filename,
        updatedContent,
        `Apply AI-generated fixes\n\n- ${filename}: ${reason}`,
        branch,
        blobSha   
      );

      console.log(`[autofix] ✓ Committed fix for ${filename}`);
      appliedFixes.push({ filename, reason });

    } catch (err) {
      const status = err.response?.status;
      const msg = status === 409
        ? "Conflict: file was modified concurrently. Re-apply the label to retry."
        : err.message;

      console.error(`[autofix] Failed to commit ${filename} (HTTP ${status ?? "?"}):`, msg);
      skippedFiles.push({ filename, reason: `Commit failed: ${msg}` });
    }
  }

  await postAutoFixSummary(repo, prNumber, appliedFixes, skippedFiles);
}

async function postAutoFixSummary(repo, prNumber, appliedFixes, skippedFiles) {
  const fixLines  = appliedFixes.map(f => `- ✅ \`${f.filename}\` — ${f.reason}`);
  const skipLines = skippedFiles.map(f => `- ⏭️ \`${f.filename}\` — ${f.reason}`);

  const body = [
    "## 🤖 AI Auto-Fix Results",
    "",
    appliedFixes.length > 0
      ? `### Fixes Applied (${appliedFixes.length})\n${fixLines.join("\n")}`
      : "### No fixes were applied.",
    "",
    skippedFiles.length > 0
      ? `### Skipped Files (${skippedFiles.length})\n${skipLines.join("\n")}`
      : "",
    "",
    "---",
    "_Generated by RepoSpace AI Auto-Fix. Always review AI-generated commits before merging._"
  ].filter(Boolean).join("\n");

  try {
    await postPRComment(repo, prNumber, body);
    console.log("[autofix] Summary comment posted.");
  } catch (err) {
    console.error("[autofix] Failed to post summary comment:", err.message);
  }
}


export default async function webhookHandler(req, res) {
  const event   = req.headers["x-github-event"];
  const payload = req.body;

  // 
  if (
    event === "pull_request" &&
    (payload.action === "opened" || payload.action === "synchronize")
  ) {
    res.sendStatus(200);

    const repo     = payload.repository.full_name;
    const prNumber = payload.pull_request.number;

    try {
      await handlePRReview(repo, prNumber);
    } catch (err) {
      console.error("[webhook] Unhandled error in review pipeline:", err.message);
    }

    return;
  }

  if (
    event === "pull_request" &&
    payload.action === "labeled" &&
    payload.label?.name === "apply-ai-fixes"
  ) {
    res.sendStatus(200);

    const repo     = payload.repository.full_name;
    const prNumber = payload.pull_request.number;

    const branch   = payload.pull_request.head.ref;

    console.log(`[webhook] "apply-ai-fixes" label on PR #${prNumber} (branch: ${branch})`);

    try {
      await handleAutoFix(repo, prNumber, branch);
    } catch (err) {
      console.error("[webhook] Unhandled error in auto-fix pipeline:", err.message);
    }

    return;
  }

  res.sendStatus(200);
}