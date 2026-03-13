// src/agents/styleAgent.js

import { Agent, run } from "@openai/agents";

const styleAgent = new Agent({
  name: "Code Style Agent",
  model: "gpt-4.1-mini",
  instructions: `
You are a senior developer reviewing coding style.

Check:
- naming conventions
- formatting
- readability
- best practices

Return JSON:

{
  "style_suggestions": ["string"]
}
`,
  max_output_tokens: 150
});

export async function analyzeStyle(diff) {

  try {
    const result = await run(styleAgent, diff);

    const message = result.output?.[0];
    const text = message?.content?.[0]?.text;

    if (!text) return null;

    const clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(clean);

  } catch (err) {
    console.error("Style agent failed:", err.message);
    return null;
  }
}