import { reviewPR } from "../agents/prReviewAgent.js";
import { analyzeRisk } from "../agents/riskAgent.js";
import { analyzeSecurity } from "../agents/securityAgent.js";
import { analyzePerformance } from "../agents/performanceAgent.js";
import { analyzeStyle } from "../agents/styleAgent.js";

export async function runReviewPipeline(diff) {

  const results = {
    review: null,
    risk: null,
    security: null,
    performance: null,
    style: null
  };

  try {
    results.risk = await analyzeRisk(diff);
  } catch {}

  try {
    results.security = await analyzeSecurity(diff);
  } catch {}

  try {
    results.performance = await analyzePerformance(diff);
  } catch {}

  try {
    results.style = await analyzeStyle(diff);
  } catch {}

  try {
    results.review = await reviewPR(diff);
  } catch {}

  return results;
}