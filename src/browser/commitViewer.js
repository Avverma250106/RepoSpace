// src/browser/commitViewer.js

import { exec } from "child_process";

/**
 * Opens the GitHub commit page in the system's default browser.
 * If Brave is set as your default browser, it will open in Brave automatically.
 *
 * @param {string} repo
 * @param {string} commitSha
 * @param {string} filename
 */
export async function openCommitInBrave(repo, commitSha, filename) {
  const url = `https://github.com/${repo}/commit/${commitSha}`;

  console.log(`[browser] Commit: ${commitSha.slice(0, 7)} — opening in browser`);
  console.log(`[browser] URL: ${url}`);

  try {
    // Windows
    if (process.platform === "win32") {
      exec(`start "" "${url}"`);
    }
    // macOS
    else if (process.platform === "darwin") {
      exec(`open "${url}"`);
    }
    // Linux
    else {
      exec(`xdg-open "${url}"`);
    }

    console.log(`[browser] Opened successfully for ${filename}`);
  } catch (err) {
    console.error("[browser] Failed to open browser:", err.message);
    console.log(`[browser] Open manually: ${url}`);
  }
}