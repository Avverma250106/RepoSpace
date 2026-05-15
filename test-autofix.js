import dotenv from "dotenv";
import { getPRDetails } from "./src/services/githubService.js";
import { handleAutoFix } from "./src/server/webhook.js";

dotenv.config();

const repo = process.env.GITHUB_REPO_FULL;
const prNumber = parseInt(process.argv[2], 10);

if (!prNumber) {
  console.log("Usage: node test-autofix.js <pr-number>");
  process.exit(1);
}

async function main() {
  const pr = await getPRDetails(repo, prNumber);
  const branch = pr.head.ref;

  console.log(`Testing auto-fix on PR #${prNumber}`);
  console.log(`Branch: ${branch}`);

  await handleAutoFix(repo, prNumber, branch);

  console.log("Auto-fix test complete.");
}

main().catch(console.error);