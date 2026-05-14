// src/server/webhook.js

import { getPRDiff, postPRComment } from "../services/githubService.js";
//import { reviewPR } from "../agents/prReviewAgent.js";
import { formatReview } from "../utils/formatter.js";
import { runReviewPipeline } from "../orchestrator/reviewPipeline.js";
import crypto from "crypto";

function splitDiffByFile(diff) {
  return diff
    .split("diff --git")
    .slice(1)
    .map(file => "diff --git" + file);
}

function verifySignature(req) {
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}


export default async function webhookHandler(req, res) {
  // if (!verifySignature(req)) return res.sendStatus(401);
  const event = req.headers["x-github-event"];
  const payload = req.body;

  if (event === "pull_request" && (payload.action === "opened" || payload.action === "synchronize")) {
    try {
      console.log("Pull request opened");

      const repo = payload.repository.full_name;
      const prNumber = payload.pull_request.number;

      const diff = await getPRDiff(repo, prNumber);

      const MAX_TOTAL_DIFF_LENGTH = 15000;
      if (diff.length > MAX_TOTAL_DIFF_LENGTH) {
        console.log("⚠ PR too large. Skipping AI review.");
        return res.sendStatus(200);
      }

      const files = splitDiffByFile(diff);

      const MAX_FILES = 3; 
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

      console.log("\nGenerated Review Comment:\n");
      await postPRComment(repo, prNumber, comment);
      console.log("Comment posted to GitHub.");

    } catch (err) {
      console.error("Error processing PR:", err.message);
    }
  }

  res.sendStatus(200);
}