// src/server/commitWatcher.js

const clients = new Set();
let lastCommit = null;

export function notifyCommit(repo, commitSha, filename) {
  lastCommit = {
    repo,
    commitSha,
    filename,
    ts: Date.now()
  };

  console.log("[commitWatcher] notifyCommit called");
  console.log("[commitWatcher] Repo:", repo);
  console.log("[commitWatcher] Commit:", commitSha.slice(0, 7));
  console.log("[commitWatcher] File:", filename);
  console.log("[commitWatcher] Connected clients:", clients.size);

  const payload = JSON.stringify(lastCommit);

  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.warn("[commitWatcher] Failed to write to client:", err.message);
      clients.delete(res);
    }
  }

  console.log(
    `[commitWatcher] Broadcast commit ${commitSha.slice(0, 7)} to ${clients.size} client(s)`
  );
}

export function sseHandler(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      cleanup();
    }
  }, 25000);

  if (lastCommit && Date.now() - lastCommit.ts < 60000) {
    try {
      res.write(`data: ${JSON.stringify(lastCommit)}\n\n`);
    } catch {
      cleanup();
      return;
    }
  } else {
    res.write(": connected\n\n");
  }

  clients.add(res);

  console.log(
    `[commitWatcher] SSE client connected. Total clients: ${clients.size}`
  );

  function cleanup() {
    clearInterval(heartbeat);

    if (clients.has(res)) {
      clients.delete(res);
      console.log(
        `[commitWatcher] SSE client disconnected. Total clients: ${clients.size}`
      );
    }
  }

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);
}