// test-autofix.js
// Usage: node test-autofix.js <pr-number>
//
// Manually triggers the auto-fix pipeline for a PR.
// After each successful commit, Brave opens the GitHub commit page automatically.

import dotenv from "dotenv";
import {
  getPRDetails,
  getPRFiles,
  getFileContent,
  updateFile,
  getLatestCommitSha,
  postPRComment
} from "./src/services/githubService.js";
import { generateFix }       from "./src/agents/fixAgent.js";
import { openCommitInBrave } from "./src/browser/commitViewer.js";

dotenv.config();

const repo = process.env.GITHUB_REPO_FULL;

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

async function runAutoFix(prNumber) {
  if (!repo) {
    console.error("Error: GITHUB_REPO_FULL is not set in your .env file.");
    process.exit(1);
  }

  console.log(`\nFetching PR #${prNumber} from ${repo}...`);
  const pr     = await getPRDetails(repo, prNumber);
  const branch = pr.head.ref;

  console.log(`Branch: ${branch}`);
  console.log(`Title:  ${pr.title}\n`);

  let changedFiles;
  try {
    changedFiles = await getPRFiles(repo, prNumber);
  } catch (err) {
    console.error("Failed to fetch PR files:", err.message);
    return;
  }

  const filesToFix = changedFiles
    .filter(f => f.status !== "removed")
    .filter(f => isFixableFile(f.filename))
    .filter(f => f.patch)
    .slice(0, MAX_FIX_FILES);

  if (!filesToFix.length) {
    console.log("No fixable files found.");
    return;
  }

  console.log(`Found ${filesToFix.length} fixable file(s):`);
  filesToFix.forEach(f => console.log(`  - ${f.filename}`));
  console.log();

  const appliedFixes = [];
  const skippedFiles = [];

  for (const file of filesToFix) {
    const { filename, patch, sha: blobSha } = file;
    console.log(`Processing: ${filename}`);

    let fileContent;
    try {
      fileContent = await getFileContent(repo, filename, branch);
      console.log(`  Fetched file (${fileContent.length} chars)`);
    } catch (err) {
      console.warn(`  Could not fetch content: ${err.message}`);
      skippedFiles.push({ filename, reason: "Could not fetch file content." });
      continue;
    }

    let fix;
    try {
      console.log("  Generating fix...");
      fix = await generateFix({ filename, patch, fileContent });
    } catch (err) {
      console.error(`  Fix agent error: ${err.message}`);
      skippedFiles.push({ filename, reason: "Fix agent error." });
      continue;
    }

    if (!fix) {
      console.log("  No actionable fix found.");
      skippedFiles.push({ filename, reason: "No actionable fix found." });
      continue;
    }

    console.log(`  Reason: ${fix.reason}`);

    if (!fix.original_code || !fix.fixed_code) {
      console.warn("  Incomplete fix — skipping.");
      skippedFiles.push({ filename, reason: "Incomplete fix returned." });
      continue;
    }

    if (!fileContent.includes(fix.original_code)) {
      console.warn("  Snippet not found in file — skipping.");
      skippedFiles.push({ filename, reason: "Fix snippet not found in file." });
      continue;
    }

    const updatedContent = fileContent.replace(fix.original_code, fix.fixed_code);
    if (updatedContent === fileContent) {
      console.warn("  Replace produced no change — skipping.");
      skippedFiles.push({ filename, reason: "Replace produced no change." });
      continue;
    }

    try {
      console.log("  Committing to GitHub...");
      await updateFile(
        repo, filename, updatedContent,
        `Apply AI-generated fixes\n\n- ${filename}: ${fix.reason}`,
        branch, blobSha
      );
      console.log("  Committed.");

      // Get the SHA of the commit we just pushed, then open it in Brave.
      const commitSha = await getLatestCommitSha(repo, branch);
      console.log(`  SHA: ${commitSha.slice(0, 7)}`);

      // This launches Brave and navigates directly to the commit page.
      // Non-blocking — Playwright opens the browser in the background
      // while the loop continues to the next file.
      openCommitInBrave(repo, commitSha, filename);

      appliedFixes.push({ filename, reason: fix.reason });

    } catch (err) {
      const status = err.response?.status;
      const msg = status === 409
        ? "Concurrent conflict — re-apply label to retry."
        : err.message;
      console.error(`  Commit failed (HTTP ${status ?? "?"}): ${msg}`);
      skippedFiles.push({ filename, reason: `Commit failed: ${msg}` });
    }

    console.log();
  }

  console.log("─".repeat(50));
  console.log(`Applied: ${appliedFixes.length}  |  Skipped: ${skippedFiles.length}`);

  if (appliedFixes.length) {
    console.log("\nFixes applied:");
    appliedFixes.forEach(f => console.log(`  + ${f.filename} — ${f.reason}`));
  }
  if (skippedFiles.length) {
    console.log("\nSkipped:");
    skippedFiles.forEach(f => console.log(`  - ${f.filename}: ${f.reason}`));
  }

  // Post summary to GitHub PR
  const fixLines  = appliedFixes.map(f => `- \`${f.filename}\` — ${f.reason}`);
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
    console.log("\nSummary comment posted to GitHub.");
  } catch (err) {
    console.error("\nFailed to post summary:", err.message);
  }

  console.log("\nDone.");
}

const PR_NUMBER = parseInt(process.argv[2], 10);

if (!PR_NUMBER) {
  console.log("Usage: node test-autofix.js <pr-number>");
  process.exit(1);
}

runAutoFix(PR_NUMBER).catch(console.error);