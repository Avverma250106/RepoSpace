import {
  createPRReview,
  getPRHeadSha
} from "../services/githubService.js";

import { generateInlineComments } from "../agents/inlineReviewAgent.js";

export async function postInlineReview(repo, prNumber, diff) {
  const comments = await generateInlineComments(diff);

  if (!comments.length) {
    console.log("[inline] No inline comments generated.");
    return;
  }

  const commitId = await getPRHeadSha(repo, prNumber);

  const review = {
    commit_id: commitId,
    event: "COMMENT",
    body: "RepoSpace posted inline review comments.",
    comments: comments.map(comment => ({
      path: comment.path,
      line: comment.line,
      side: "RIGHT",
      body: comment.body
    }))
  };

  await createPRReview(repo, prNumber, review);

  console.log(`[inline] Posted ${comments.length} inline comments.`);
}