// src/server/webhook.js

import { getPRDiff, postPRComment } from "../services/githubService.js";
//import { reviewPR } from "../agents/prReviewAgent.js";
import { formatReview } from "../utils/formatter.js";
import { runReviewPipeline } from "../orchestrator/reviewPipeline.js";

function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}

export default async function webhookHandler(req, res) {
  const event = req.headers["x-github-event"];
  const payload = req.body;

  if (event === "pull_request" && payload.action === "opened") {
    try {
      console.log("📦 Pull request opened");

      const repo = payload.repository.full_name;
      const prNumber = payload.pull_request.number;

      const diff = await getPRDiff(repo, prNumber);

      const MAX_TOTAL_DIFF_LENGTH = 15000;
      if (diff.length > MAX_TOTAL_DIFF_LENGTH) {
        console.log("⚠ PR too large. Skipping AI review.");
        return res.sendStatus(200);
      }

      const files = splitDiffByFile(diff);

      //const MAX_FILES = 3; // Limit AI calls
      const MAX_FILE_LENGTH = 5000; // Limit per file tokens

      const filesToReview = files.slice(0, MAX_FILES);

      const reviews = [];

      for (const file of filesToReview) {

  if (file.length > MAX_FILE_LENGTH) {
    console.log("⚠ Skipping large file");
    continue;
  }

  const result = await runReviewPipeline(file);

  if (!result) {
    console.log("Pipeline returned nothing");
    continue;
  }

  if (result.risk) {
    console.log("Risk score for file:", result.risk.risk_score);
  }

  if (result.review) {
    reviews.push(result.review);
  } else {
    console.log("Review agent returned null");
  }
}

      if (reviews.length === 0) {
        console.log("No files reviewed.");
        return res.sendStatus(200);
      }

      const comment = formatReview(reviews);

      await postPRComment(repo, prNumber, comment);

    } catch (err) {
      console.error("Error processing PR:", err.message);
    }
  }

  res.sendStatus(200);
}