// src/agents/fixAgent.js

import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Asks the LLM to generate a single meaningful fix for a changed file.
 * The fix may range from a one-line change up to a full function replacement
 * or algorithm-level refactor — whatever the diff actually calls for.
 *
 * @param {object} params
 * @param {string} params.filename       - e.g. "src/sort.cpp"
 * @param {string} params.patch          - raw unified diff from the GitHub API
 * @param {string} [params.fileContent]  - full current file contents (strongly recommended)
 *
 * @returns {Promise<{original_code: string, fixed_code: string, reason: string} | null>}
 */
export async function generateFix({ filename, patch, fileContent = "" }) {

  const systemPrompt = `
You are a senior software engineer performing automated code fixes as part of a CI/CD pipeline.
Your job is to implement the single most impactful improvement visible in the diff — whether that
is a one-line security fix, a block-level refactor, or a complete algorithm replacement.

You are explicitly authorised to:
- Replace a single line
- Replace a block of code (e.g. a loop, a conditional, an initialisation section)
- Replace an entire function with a better implementation
- Replace an inefficient algorithm with a correct, idiomatic, and performant one
  (e.g. Bubble Sort → std::sort, manual O(n²) search → hash map lookup)
- Implement any performance or correctness improvement clearly suggested by the diff

You are NOT allowed to:
- Change function signatures, public interfaces, or exported API shapes
- Modify code outside the scope of the single improvement you are making
- Introduce new dependencies that are not already present in the file
- Return prose, markdown, or anything other than a single valid JSON object

You always return valid JSON and nothing else.
`.trim();

  const userPrompt = `
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

Identify the single most impactful improvement visible in this diff.
This may be a security fix, a bug fix, an algorithm replacement, or a performance refactor.

Return a JSON object with EXACTLY these three fields:

{
  "original_code": "<verbatim substring from the current file — may be one line, a block, or an entire function>",
  "fixed_code":    "<complete drop-in replacement for original_code>",
  "reason":        "<one sentence: what the problem is and what the fix does>"
}

Rules you MUST follow:

ORIGINAL CODE:
- Must be a verbatim substring copied exactly from the current file contents above.
- May be as short as one line or as long as an entire function — whatever is needed.
- Must include the complete block you intend to replace: if you are replacing a function,
  include the full function from its opening signature to its closing brace.
- Do not truncate, paraphrase, or summarise — copy it character-for-character including
  all whitespace and indentation exactly as it appears in the file.

FIXED CODE:
- Must be a complete, correct, drop-in replacement for original_code.
- Must preserve the same indentation level as original_code.
- Must preserve the existing function signature, return type, and public interface.
- For algorithm replacements (e.g. Bubble Sort → std::sort), provide the full
  working implementation — not a placeholder or comment.
- For security fixes, apply the complete safe pattern (e.g. parameterized queries,
  proper escaping) — not just a comment saying "fix this".

SCOPE:
- Fix one thing. The most important thing. Do not bundle multiple unrelated changes.
- If the diff contains a performance problem AND a security problem, fix the security
  problem. If there is only a performance problem, fix that fully.

NO FIX:
- If there is genuinely nothing to improve, return:
  {"original_code": "", "fixed_code": "", "reason": "No fix needed."}

Return ONLY the JSON object. No markdown fences, no prose, no extra keys.
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      // Increased from 1024 — large refactors (e.g. full function replacements)
      // need more room. 3000 covers even sizeable algorithm rewrites.
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   }
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

    // Hard guard: original_code must exist verbatim in the current file.
    // This is especially important for large replacements — if the model
    // reformatted or paraphrased even a single character, the replacement
    // would silently fail or corrupt the file.
    if (fileContent && !fileContent.includes(fix.original_code)) {
      console.warn(
        `[fixAgent] original_code not found verbatim in ${filename} — skipping.\n` +
        `  First 120 chars: ${fix.original_code.slice(0, 120)}`
      );
      return null;
    }

    console.log(`[fixAgent] Fix for ${filename} (${fix.original_code.split("\n").length} line(s) → ${fix.fixed_code.split("\n").length} line(s)): ${fix.reason}`);

    return fix;

  } catch (err) {
    console.error(`[fixAgent] OpenAI call failed for ${filename}:`, err.message);
    return null;
  }
}