// src/agents/securityAgent.js

import { Agent, run } from "@openai/agents";

const securityAgent = new Agent({
  name: "Security Agent",
  model: "gpt-4.1-mini",
  instructions: `
You are a security engineer reviewing a pull request diff.

Find security vulnerabilities like:
- hardcoded secrets
- eval usage
- unsafe SQL
- command injection
- exposed API keys

Return JSON:

{
  "security_findings": ["string"]
}
`,
  max_output_tokens: 150
});

export async function analyzeSecurity(diff) {

  try {
    const result = await run(securityAgent, diff);

    const message = result.output?.[0];
    const text = message?.content?.[0]?.text;

    if (!text) return null;

    return JSON.parse(text);

  } catch (err) {
    console.error("Security agent failed:", err.message);
    return null;
  }
}