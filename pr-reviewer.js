// pr-reviewer.js
// Usage: node pr-reviewer.js <pr-number>
//
// Manually triggers the full progressive review pipeline for a PR.
// Use this to test the review flow without needing ngrok or a live webhook.

import dotenv from "dotenv";
import { getPRDiff } from "./src/services/githubService.js";
import { runProgressiveReview } from "./src/utils/progressiveReview.js";

dotenv.config();

const repo = process.env.GITHUB_REPO_FULL;

function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}

async function reviewPR(prNumber) {
  if (!repo) {
    console.error("Error: GITHUB_REPO_FULL is not set in your .env file.");
    process.exit(1);
  }

  console.log(`Reviewing PR #${prNumber} in ${repo}`);

  const diff = await getPRDiff(repo, prNumber);

  const MAX_TOTAL_DIFF_LENGTH = 15000;
  if (diff.length > MAX_TOTAL_DIFF_LENGTH) {
    console.log("PR diff too large — skipping.");
    return;
  }

  const files = splitDiffByFile(diff);

  const MAX_FILES    = 5;
  const MAX_FILE_LEN = 5000;

  const filesToReview = files
    .filter(f => f.length <= MAX_FILE_LEN)
    .slice(0, MAX_FILES);

  if (!filesToReview.length) {
    console.log("No reviewable files found.");
    return;
  }

  console.log(`Reviewing ${filesToReview.length} file(s)...\n`);

  // runProgressiveReview handles everything:
  //   - creates the placeholder comment
  //   - runs each agent and updates the comment after every stage
  //   - posts the auto-fix callout at the end
  for (const file of filesToReview) {
    await runProgressiveReview(repo, prNumber, file);
  }

  console.log("\nReview complete.");
}

const PR_NUMBER = parseInt(process.argv[2]);

if (!PR_NUMBER) {
  console.log("Usage: node pr-reviewer.js <pr-number>");
  process.exit(1);
}

reviewPR(PR_NUMBER).catch(console.error);