// src/utils/formatter.js

export function formatReview(reviews) {

  const summaries = [];
  const allBugs = [];
  const allSecurityIssues = [];
  const allImprovements = [];

  const securityFindings = [];
  const performanceIssues = [];
  const styleSuggestions = [];

  for (const r of reviews) {

    if (r.summary) summaries.push(r.summary);

    if (r.bugs) allBugs.push(...r.bugs);

    if (r.security_issues) allSecurityIssues.push(...r.security_issues);

    if (r.improvements) allImprovements.push(...r.improvements);

    if (r.security_findings) securityFindings.push(...r.security_findings);

    if (r.performance_issues) performanceIssues.push(...r.performance_issues);

    if (r.style_suggestions) styleSuggestions.push(...r.style_suggestions);
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

### 🛡 Security Findings
${securityFindings.length ? securityFindings.map(s => `- ${s}`).join("\n") : "None"}

---

### ⚡ Performance Issues
${performanceIssues.length ? performanceIssues.map(p => `- ${p}`).join("\n") : "None"}

---

### 🎨 Style Suggestions
${styleSuggestions.length ? styleSuggestions.map(s => `- ${s}`).join("\n") : "None"}

---

### 🚀 Improvements
${allImprovements.length ? allImprovements.map(i => `- ${i}`).join("\n") : "None"}

---

### 🧪 Generated Unit Tests

${generatedTests.length ? generatedTests.map(t => `Function: ${t.function_name} \`\`\`javascript${t.test_code}\`\`\``).join("\n") : "No tests generated"}


_Reviewed by AI Multi-Agent System_
`;
}