import { Agent, run } from "@openai/agents";

const testAgent = new Agent({
  name: "Test Generator Agent",
  model: "gpt-4.1-mini",
  instructions: `
You are a senior QA engineer.

Given a GitHub pull request diff, generate unit tests for any new or modified functions.

Rules:
- Write tests using Jest
- Focus on correctness and edge cases
- Only generate tests if functions are present
- Return JSON only

Format:

{
  "tests": [
    {
      "function_name": "string",
      "test_code": "string"
    }
  ]
}
`,
  max_output_tokens: 400
});

export async function generateTests(diff) {

  try {

    const result = await run(testAgent, diff);

    const message = result.output?.[0];
    const text = message?.content?.[0]?.text;

    if (!text) return null;

    const clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(clean);

  } catch (err) {
    console.error("Test generator agent failed:", err.message);
    return null;
  }
}