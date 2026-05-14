// src/utils/formatter.js

export function formatReview(reviews) {

  const summaries = [];
  const allBugs = [];
  const allSecurityIssues = [];
  const allImprovements = [];

  const securityFindings = [];
  const performanceIssues = [];
  const styleSuggestions = [];
  const testCases = [];

  for (const r of reviews) {

    if (r.summary) summaries.push(r.summary);

    if (r.bugs) allBugs.push(...r.bugs);

    if (r.security_issues) allSecurityIssues.push(...r.security_issues);

    if (r.improvements) allImprovements.push(...r.improvements);

    if (r.security_findings) securityFindings.push(...r.security_findings);

    if (r.performance_issues) performanceIssues.push(...r.performance_issues);

    if (r.style_suggestions) styleSuggestions.push(...r.style_suggestions);

    if(r.tests) testCases.push(...r.tests);
  }

  return `
## AI PR Review

### Summary
${summaries.length ? summaries.join("\n\n") : "No major concerns detected."}

---

### Bugs
${allBugs.length ? allBugs.map(b => `- ${b}`).join("\n") : "None"}

---

### Security Issues
${allSecurityIssues.length ? allSecurityIssues.map(s => `- ${s}`).join("\n") : "None"}

---

### Security Findings
// ${securityFindings.length ? securityFindings.map(s => `- ${s}`).join("\n") : "None"}
${securityFindings.length ? securityFindings.map(s => `- **[${s.severity?.toUpperCase()}]** ${s.issue}\n  > Fix: ${s.fix}`) : "None"}
---

### Performance Issues
${performanceIssues.length ? performanceIssues.map(p => `- **${p.impact}** — ${p.issue}\n  > Fix: ${p.fix}`) : "None"}

---

### Style Suggestions
${styleSuggestions.length ? styleSuggestions.map(s => `- ${s}`).join("\n") : "None"}

---

### Improvements
${allImprovements.length ? allImprovements.map(i => `- ${i}`).join("\n") : "None"}

---

### Test Cases
${testCases.length ? testCases.map(t => `**${t.function_name}**\`\`\`js${t.test_code}\`\`\``).join("\n\n"): "None"}

_Reviewed by AI Multi-Agent System_
`;
}