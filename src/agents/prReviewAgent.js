import { Agent, run } from "@openai/agents";

const prReviewAgent = new Agent({
  name: "PR Review Agent",
  model: "gpt-4.1-mini",
  instructions: `
You are a senior software engineer reviewing a GitHub pull request diff.

Return ONLY valid JSON in this format:

{
  "summary": "string",
  "bugs": ["string"],
  "security_issues": ["string"],
  "improvements": ["string"]
}
`,
  max_output_tokens: 250
});

export async function reviewPR(diff) {

  if (process.env.USE_MOCK_AI === "true") {
    console.log("🧪 MOCK MODE: Skipping AI review");

    return {
      summary: "Mock summary of PR.",
      bugs: [],
      security_issues: [],
      improvements: ["Consider adding input validation."]
    };
  }

  try {
    const result = await run(prReviewAgent, diff);

    // Extract message text from agent output
    const message = result.output?.[0];
    const text = message?.content?.[0]?.text;

    console.log("AI response text:", text);

    if (!text) {
      console.log("Agent returned empty response");
      return null;
    }

    const parsed = JSON.parse(text);
    return parsed;

  } catch (err) {
    console.error("PR review agent failed:", err.message);
    return null;
  }
}