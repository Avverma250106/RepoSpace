import { reviewPR } from "../agents/prReviewAgent.js";
import { analyzeRisk } from "../agents/riskAgent.js";
import { analyzeSecurity } from "../agents/securityAgent.js";
import { analyzePerformance } from "../agents/performanceAgent.js";
import { analyzeStyle } from "../agents/styleAgent.js";
// import { generateTests } from "../agents/testCaseAgent.js";

function safeRun(agentFn, diff, name) {
  return agentFn(diff).catch(err => {
    console.error(`${name} failed:`, err.message);
    return null;
  });
}

export async function runReviewPipeline(diff) {

  const [risk, security, performance, style, review, tests] = await Promise.all([
    safeRun(analyzeRisk, diff, "Risk Agent"),
    safeRun(analyzeSecurity, diff, "Security Agent"),
    safeRun(analyzePerformance, diff, "Performance Agent"),
    safeRun(analyzeStyle, diff, "Style Agent"),
    safeRun(reviewPR, diff, "Review Agent"),
    // safeRun(generateTests, diff, "Test Generator Agent")
  ]);

  return {
    risk,
    security,
    performance,
    style,
    review,
  };
}