// src/orchestrator/reviewPipeline.js

import { reviewPR } from "../agents/prReviewAgent.js";
import { analyzeRisk } from "../agents/riskAgent.js";

export async function runReviewPipeline(diff) {

  const results = {
    review: null,
    risk: null
  };

  try {
    results.risk = await analyzeRisk(diff);
  } catch (err) {
    console.error("Risk agent failed:", err.message);
  }

  try {
    results.review = await reviewPR(diff);
  } catch (err) {
    console.error("Review agent failed:", err.message);
  }

  return results;
}