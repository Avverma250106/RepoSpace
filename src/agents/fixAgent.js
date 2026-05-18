// src/agents/fixAgent.js

import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates a complete corrected version of a file.
 *
 * Instead of returning a small patch:
 * {
 *   original_code,
 *   fixed_code,
 *   reason
 * }
 *
 * this agent returns the full corrected file:
 * {
 *   fixed_file,
 *   reason
 * }
 *
 * This approach is much more reliable for:
 * - Buggy algorithms (e.g. Dijkstra)
 * - Large refactors
 * - Bubble Sort -> std::sort
 * - Multi-line security fixes
 *
 * @param {object} params
 * @param {string} params.filename
 * @param {string} params.patch
 * @param {string} [params.fileContent]
 *
 * @returns {Promise<{fixed_file: string, reason: string} | null>}
 */
export async function generateFix({
  filename,
  patch,
  fileContent = ""
}) {
  const systemPrompt = `
You are a senior software engineer performing automated code fixes.

Your task is to implement the single most impactful improvement visible in the pull request.

You are explicitly allowed to:
- Fix functional bugs
- Fix security vulnerabilities
- Correct logic errors
- Improve performance
- Replace an inefficient algorithm with a better one
- Rewrite an entire function
- Rewrite the entire file when necessary

Examples:
- Replace Bubble Sort with std::sort
- Correct Dijkstra's algorithm
- Replace hardcoded secrets with environment variables
- Fix SQL injection using parameterized queries

Rules:
- Preserve public interfaces and function signatures.
- Return the complete corrected file.
- Do not return partial snippets.
- Return only valid JSON.
- If no improvement is needed, return the original file unchanged.
`.trim();

  const userPrompt = `
You are reviewing the following file.

FILE: ${filename}

GIT DIFF:
\`\`\`diff
${patch}
\`\`\`

CURRENT FILE CONTENTS:
\`\`\`
${fileContent}
\`\`\`

Return a JSON object with EXACTLY these two fields:

{
  "fixed_file": "<the complete corrected file contents>",
  "reason": "<one sentence explaining the fix>"
}

Rules:
- fixed_file must contain the full corrected file.
- Preserve the same function signatures and public interfaces.
- Implement the single most impactful improvement completely.
- Entire function and file rewrites are allowed.
- If no fix is needed, return the original file unchanged.

Return ONLY the JSON object.
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? "";

    let fix;
    try {
      fix = JSON.parse(raw);
    } catch {
      console.error(`[fixAgent] JSON parse error for ${filename}:`, raw);
      return null;
    }

    const hasFixedFile =
      typeof fix.fixed_file === "string" &&
      fix.fixed_file.trim() !== "";

    const hasReason =
      typeof fix.reason === "string";

    if (!hasFixedFile || !hasReason) {
      console.log(
        `[fixAgent] No actionable fix for ${filename}: ${
          fix.reason ?? "no reason given"
        }`
      );
      return null;
    }

    // Skip if the generated file is identical to the current file.
    if (fileContent && fix.fixed_file === fileContent) {
      console.log(
        `[fixAgent] No changes generated for ${filename}.`
      );
      return null;
    }

    console.log(
      `[fixAgent] Generated full-file fix for ${filename}: ${fix.reason}`
    );

    return fix;
  } catch (err) {
    console.error(
      `[fixAgent] OpenAI call failed for ${filename}:`,
      err.message
    );
    return null;
  }
}