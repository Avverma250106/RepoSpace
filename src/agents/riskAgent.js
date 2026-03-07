import { Agent, run } from "@openai/agents";

const riskAgent = new Agent({
  name: "Risk Analysis Agent",
  model: "gpt-4.1-mini",
  instructions: `
Analyze a pull request diff and estimate risk level.

Return JSON:
{
  "risk_score": number,
  "reason": string
}
`,
  max_output_tokens: 100
});

export async function analyzeRisk(diff) {

  if (process.env.USE_MOCK_AI === "true") {
    console.log("🧪 MOCK MODE: Skipping risk analysis");

    return {
      risk_score: 3,
      reason: "Small change affecting one file."
    };
  }

  try {

    const result = await run(riskAgent, diff);

    return result.final_output;

  } catch (err) {
    console.error("Risk agent failed:", err.message);
    return null;
  }
}