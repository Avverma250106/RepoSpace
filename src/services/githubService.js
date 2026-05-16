// src/services/githubService.js

import axios from "axios";

function githubHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra
  };
}

export async function getPRDiff(repo, prNumber) {
  if (process.env.USE_MOCK_DIFF === "true") {
    return `diff --git a/app.js b/app.js\nindex 123..456 100644\n--- a/app.js\n+++ b/app.js\n@@\n+ if (!user) throw new Error("User not found");\n`;
  }
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;
  const res = await axios.get(url, {
    headers: githubHeaders({ Accept: "application/vnd.github.v3.diff" })
  });
  return res.data;
}

export async function getPRDetails(repo, prNumber) {
  const res = await axios.get(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
    { headers: githubHeaders() }
  );
  return res.data;
}

export async function getPRFiles(repo, prNumber) {
  const res = await axios.get(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/files`,
    { headers: githubHeaders() }
  );
  return res.data;
}

export async function getFileContent(repo, path, ref) {
  const res = await axios.get(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`,
    { headers: githubHeaders({ Accept: "application/vnd.github.v3+json" }) }
  );
  return Buffer.from(res.data.content.replace(/\n/g, ""), "base64").toString("utf8");
}

export async function createPRComment(repo, prNumber, body) {
  if (process.env.USE_MOCK_AI === "true") {
    console.log("[mock] createPRComment:", body);
    return 999999;
  }
  const res = await axios.post(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    { body },
    { headers: githubHeaders() }
  );
  return res.data.id;
}

export async function updatePRComment(repo, commentId, body) {
  if (process.env.USE_MOCK_AI === "true") {
    console.log(`[mock] updatePRComment #${commentId}\n${"─".repeat(50)}\n${body}\n${"─".repeat(50)}`);
    return;
  }
  const [owner, repoName] = repo.split("/");
  await axios.patch(
    `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}`,
    { body },
    { headers: githubHeaders() }
  );
}

export async function postPRComment(repo, prNumber, comment) {
  if (process.env.USE_MOCK_AI === "true") {
    console.log("[mock] postPRComment:", comment);
    return;
  }
  await axios.post(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    { body: comment },
    { headers: githubHeaders() }
  );
}

export async function updateFile(repo, path, content, message, branch, sha) {
  if (!sha) throw new Error(`updateFile: missing sha for ${path}`);
  const [owner, repoName] = repo.split("/");
  await axios.put(
    `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`,
    {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch
    },
    { headers: githubHeaders() }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — getLatestCommitSha
//
// Called immediately after updateFile() succeeds to get the SHA of the commit
// we just created. We read the branch HEAD via the Git refs API — this is the
// fastest and most reliable way since it reflects pushes instantly.
//
// The SHA is then handed to notifyCommit() which broadcasts it over SSE so the
// browser can open github.com/{repo}/commit/{sha} automatically.
//
// @param {string} repo    - "owner/repo"
// @param {string} branch  - branch name, e.g. "feature/add-login"
// @returns {Promise<string>} full 40-char commit SHA
// ─────────────────────────────────────────────────────────────────────────────
export async function getLatestCommitSha(repo, branch) {
  const res = await axios.get(
    `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers: githubHeaders() }
  );
  return res.data.object.sha;
}