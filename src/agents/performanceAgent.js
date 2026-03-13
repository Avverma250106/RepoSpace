// src/agents/performanceAgent.js

import { Agent, run } from "@openai/agents";

const performanceAgent = new Agent({
  name: "Performance Agent",
  model: "gpt-4.1-mini",
  instructions: `
You are a performance engineer reviewing a PR diff.

Identify:
- inefficient loops
- unnecessary computations
- memory issues
- heavy operations

Return JSON:

{
  "performance_issues": ["string"]
}
`,
  max_output_tokens: 150
});

export async function analyzePerformance(diff) {

  try {
    const result = await run(performanceAgent, diff);

    const message = result.output?.[0];
    const text = message?.content?.[0]?.text;

    if (!text) return null;

    const clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(clean);

  } catch (err) {
    console.error("Performance agent failed:", err.message);
    return null;
  }
}