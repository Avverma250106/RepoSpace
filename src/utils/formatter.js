//src/utils/formatter.js

export function formatReview(reviews) {
  const summaries = [];
  const allBugs = [];
  const allSecurityIssues = [];
  const allImprovements = [];

  for (const r of reviews) {
    if (r.summary) summaries.push(r.summary);
    if (r.bugs) allBugs.push(...r.bugs);
    if (r.security_issues) allSecurityIssues.push(...r.security_issues);
    if (r.improvements) allImprovements.push(...r.improvements);
  }

  return `
## 🤖 AI PR Review

### 📋 Summary
${summaries.length ? summaries.join("\n\n") : "No major concerns detected."}

---

### 🐛 Bugs
${allBugs.length ? allBugs.map(b => `- ${b}`).join("\n") : "None"}

---

### 🔐 Security Issues
${allSecurityIssues.length ? allSecurityIssues.map(s => `- ${s}`).join("\n") : "None"}

---

### 🚀 Improvements
${allImprovements.length ? allImprovements.map(i => `- ${i}`).join("\n") : "None"}

---

_Reviewed by AI Agent_
`;
}