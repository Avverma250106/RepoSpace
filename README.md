# 🤖 AI Pull Request Reviewer

An automated AI-powered code review system that analyzes GitHub pull requests and posts structured feedback directly on the PR.
The system listens to GitHub webhooks, fetches the PR diff, runs an AI review pipeline, and posts comments highlighting bugs, security issues, and improvement suggestions.

---

# 🚀 Features

* 🔔 **Automatic PR Detection**

  * Triggered when a pull request is opened or updated.

* 🧠 **AI Code Review**

  * Uses LLM-based agents to analyze code changes.

* 🪲 **Bug Detection**

  * Identifies potential logical errors or risky code.

* 🔐 **Security Analysis**

  * Flags insecure patterns such as hardcoded credentials.

* 🛠 **Improvement Suggestions**

  * Provides suggestions for readability, performance, and best practices.

* 💬 **Automated PR Comments**

  * Posts formatted feedback directly to the GitHub pull request.

---

# 🏗 Architecture

```
Pull Request Created / Updated
            │
            ▼
     GitHub Webhook
            │
            ▼
    Node.js Webhook Server
            │
            ▼
      Fetch PR Diff
            │
            ▼
      AI Review Pipeline
   (Bug / Security / Style)
            │
            ▼
      Format AI Feedback
            │
            ▼
     Post Comment to PR
```

---

# 📂 Project Structure

```
src
│
├── agents
│   └── prReviewAgent.js
│
├── orchestrator
│   └── reviewPipeline.js
│
├── server
│   └── webhook.js
│
├── services
│   └── githubService.js
│
├── utils
│   └── formatter.js
│
└── index.js
```

### Key Components

| Component         | Description                         |
| ----------------- | ----------------------------------- |
| webhook.js        | Handles GitHub webhook events       |
| githubService.js  | GitHub API interactions             |
| reviewPipeline.js | Orchestrates AI review agents       |
| prReviewAgent.js  | LLM-powered code review             |
| formatter.js      | Formats AI feedback into PR comment |

---

# ⚙️ Setup

## 1️⃣ Clone the Repository

```
git clone https://github.com/yourusername/ai-pr-reviewer.git
cd ai-pr-reviewer
```

---

## 2️⃣ Install Dependencies

```
npm install
```

---

## 3️⃣ Environment Variables

Create a `.env` file:

```
PORT=3000

GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_key

USE_MOCK_DIFF=false
USE_MOCK_AI=false
```

---

# 🔗 GitHub Webhook Setup

1. Go to your repository

```
Settings → Webhooks → Add webhook
```

2. Payload URL

```
https://your-server-url/webhook
```

3. Content Type

```
application/json
```

4. Events

```
Pull Requests
```

---

# ▶️ Running Locally

Start the server:

```
node src/index.js
```

For local webhook testing you can use:

```
ngrok http 3000
```

Then use the generated ngrok URL as your webhook endpoint.

---

# ☁️ Deployment

To run automatically without using your local machine, deploy the server to a cloud platform such as:

* Render
* Railway
* Fly.io
* AWS

After deployment, update the webhook URL to:

```
https://your-deployment-url/webhook
```

---

# 🧠 Example AI Review Output

```
Summary:
Adds a bubble sort implementation.

Bugs:
- Incorrect array initialization syntax.

Security Issues:
- None detected.

Improvements:
- Use destructuring for swapping.
- Add input validation.
```

---

# 📈 Future Improvements

* Inline PR code comments
* Parallel AI reviewers (security, performance, style)
* Risk scoring for pull requests
* Automatic code fix suggestions
* GitHub Actions CI integration

---

# 🛠 Tech Stack

* Node.js
* Express
* GitHub Webhooks
* GitHub REST API
* OpenAI API
* Axios

---

# 📜 License

MIT License
