// src/services/githubService.js

import axios from "axios";

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
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    }
  );
}

export async function getPRDetails(repo, prNumber) {

  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  return response.data;
}

export async function getPRFiles(repo, prNumber) {

  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  return response.data;
}

export async function updateFile(repo, path, content, message, branch) {

  const [owner, repoName] = repo.split("/");

  const getUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

  const fileData = await axios.get(getUrl, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
    }
  });

  const sha = fileData.data.sha;

  const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

  await axios.put(
    url,
    {
      message: message,
      content: Buffer.from(content).toString("base64"),
      sha: sha,
      branch: branch
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    }
  );
}