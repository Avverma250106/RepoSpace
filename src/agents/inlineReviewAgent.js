import OpenAI from "openai";

const openai = new OpenAI();

export async function generateInlineComments(diff) {
  const prompt = `
Analyze this git diff and identify up to 5 important issues.

Return ONLY valid JSON in this exact format:
{
  "comments": [
    {
      "path": "src/app.js",
      "line": 42,
      "body": "Potential SQL injection. Use parameterized queries."
    }
  ]
}

Rules:
- line must be a changed line number in the new file.
- body must be concise (one or two sentences).
- Return at most 5 comments.
- If no issues are found, return {"comments": []}.

Git diff:
${diff}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a senior software engineer generating GitHub inline review comments."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const raw = response.choices[0].message.content;
  const parsed = JSON.parse(raw);

  return parsed.comments || [];
}