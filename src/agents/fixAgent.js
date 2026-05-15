// src/agents/fixAgent.js
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Asks the LLM to generate a single, safe code fix for a changed file.
 *
 * @param {object} params
 * @param {string} params.filename       - e.g. "src/db/queries.js"
 * @param {string} params.patch          - raw unified diff from the GitHub API
 * @param {string} [params.fileContent]  - full current file contents (strongly recommended)
 *
 * @returns {Promise<{original_code: string, fixed_code: string, reason: string} | null>}
 */
export async function generateFix({ filename, patch, fileContent = "" }) {

  const userMessage = `
You are reviewing the following pull request file change.

FILE: ${filename}

GIT DIFF (what changed in this PR):
\`\`\`diff
${patch}
\`\`\`

${fileContent
    ? `CURRENT FILE CONTENTS (full file as it exists on the branch right now):
\`\`\`
${fileContent}
\`\`\``
    : "Note: full file contents were not available."
  }

Identify the single most important bug or security vulnerability introduced or
visible in this diff. Return a JSON object with EXACTLY these three fields:

{
  "original_code": "<the exact verbatim string that currently exists in the file>",
  "fixed_code":    "<the replacement string that fixes the problem>",
  "reason":        "<one sentence explaining the vulnerability and the fix>"
}

Rules you MUST follow:
- "original_code" must be a verbatim substring of the current file contents shown above.
  Do not paraphrase, reformat, or add/remove whitespace unless the whitespace itself is the bug.
- "fixed_code" must be a drop-in replacement — same indentation, same surrounding structure.
- If there is nothing to fix, return: {"original_code": "", "fixed_code": "", "reason": "No fix needed."}
- Return ONLY the JSON object. No markdown fences, no prose, no extra keys.
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,           // deterministic — critical for code replacement
      max_tokens: 1024,
      response_format: { type: "json_object" },   // forces valid JSON, no fences needed
      messages: [
        {
          role: "system",
          content: `
You are a senior security and code-quality engineer performing automated code fixes.
You produce minimal, surgical changes that fix exactly one problem at a time.
You never change more code than necessary to address the identified issue.
You always return valid JSON and nothing else.
          `.trim()
        },
        { role: "user", content: userMessage }
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

    const hasOriginal = typeof fix.original_code === "string" && fix.original_code.trim() !== "";
    const hasFixed    = typeof fix.fixed_code    === "string" && fix.fixed_code.trim()    !== "";
    const hasReason   = typeof fix.reason        === "string";

    if (!hasOriginal || !hasFixed || !hasReason) {
      console.log(`[fixAgent] No actionable fix for ${filename}: ${fix.reason ?? "no reason given"}`);
      return null;
    }

    // Hard guard: original_code must exist verbatim in the file.
    // Skipping this check risks committing a file with no actual change,
    // or worse — replacing the wrong snippet.
    if (fileContent && !fileContent.includes(fix.original_code)) {
      console.warn(
        `[fixAgent] original_code not found in ${filename} — skipping.\n` +
        `  Snippet: ${fix.original_code.slice(0, 120)}`
      );
      return null;
    }

    return fix;

  } catch (err) {
    console.error(`[fixAgent] OpenAI call failed for ${filename}:`, err.message);
    return null;
  }
}