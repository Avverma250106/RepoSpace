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
    console.log("MOCK MODE: Using fake PR diff");

    return `
diff --git a/app.js b/app.js
index 123..456 100644
--- a/app.js
+++ b/app.js
@@
+ if (!user) {
+   throw new Error("User not found");
+ }
`;
  }

  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3.diff",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  return response.data;
}

export async function postPRComment(repo, prNumber, comment) {

  if (process.env.USE_MOCK_AI === "true") {
    console.log("MOCK MODE: Skipping GitHub comment");
    console.log("----- COMMENT START -----");
    console.log(comment);
    console.log("----- COMMENT END -----");
    return;
  }

  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;

  
  await axios.post(
    url,
    { body: comment },
    { headers: githubHeaders() }
  );
}

export async function getPRDetails(repo, prNumber) {
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;
 
  const response = await axios.get(url, { headers: githubHeaders() });
  return response.data;
}

export async function getPRFiles(repo, prNumber) {
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files`;
 
  const response = await axios.get(url, { headers: githubHeaders() });
  return response.data;
}

export async function getFileContent(repo, path, ref) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`;
 
  const response = await axios.get(url, {
    headers: githubHeaders({ Accept: "application/vnd.github.v3+json" })
  });
 
  // GitHub returns base64 with newlines every 60 chars — strip them before decoding.
  const base64 = response.data.content.replace(/\n/g, "");
  return Buffer.from(base64, "base64").toString("utf8");
}

export async function updateFile(repo, path, content, message, branch, sha) {
  if (!sha) {
    throw new Error(`[githubService] updateFile called without sha for ${path}`);
  }
 
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;
 
  await axios.put(
    url,
    {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch
    },
    { headers: githubHeaders() }
  );
}