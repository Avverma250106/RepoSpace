import dotenv from "dotenv";
import { getPRDiff, postPRComment } from "./src/services/githubService.js";
import { runReviewPipeline } from "./src/orchestrator/reviewPipeline.js";
import { formatReview } from "./src/utils/formatter.js";

dotenv.config();

const repo = process.env.GITHUB_REPO_FULL;

function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}

async function reviewPR(prNumber) {

  console.log(`🤖 Reviewing PR #${prNumber} in ${repo}`);

  const diff = await getPRDiff(repo, prNumber);

  const MAX_TOTAL_DIFF_LENGTH = 15000;
  if (diff.length > MAX_TOTAL_DIFF_LENGTH) {
    console.log("⚠ PR too large. Skipping.");
    return;
  }

  const files = splitDiffByFile(diff);

  const MAX_FILES = 3;
  const MAX_FILE_LENGTH = 5000;

  const filesToReview = files.slice(0, MAX_FILES);

  const reviews = [];

  for (const file of filesToReview) {

    if (file.length > MAX_FILE_LENGTH) {
      console.log("⚠ Skipping large file");
      continue;
    }

    const result = await runReviewPipeline(file);

    if (!result) continue;

    if (result?.risk) {
      console.log("Risk score:", result.risk.risk_score);
    }

    if (result?.review) reviews.push(result.review);
    if (result?.security) reviews.push(result.security);
    if (result?.performance) reviews.push(result.performance);
    if (result?.style) reviews.push(result.style);
    if (result?.tests) reviews.push(result.tests);
  }

  if (!reviews.length) {
    console.log("No reviews generated.");
    return;
  }

  const comment = formatReview(reviews);

  console.log("\nGenerated Review:\n");
  console.log(comment);

  await postPRComment(repo, prNumber, comment);

  console.log("\n✅ Review posted to GitHub.");
}

// CLI entry point
const PR_NUMBER = parseInt(process.argv[2]);

if (!PR_NUMBER) {
  console.log("Usage: node pr-reviewer.js <pr-number>");
  process.exit(1);
}

reviewPR(PR_NUMBER).catch(console.error);