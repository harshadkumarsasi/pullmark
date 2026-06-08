const GITHUB_API_BASE = "https://api.github.com";

const skipPatterns = [
  /package-lock\.json/,
  /yarn\.lock/,
  /\.min\.js/,
  /\.map$/,
  /dist\//,
  /build\//,
];

async function reviewFile(file) {
  if (!file.patch) {
    return {
      filename: file.filename,
      status: file.status,
      issues: [],
      skipped: true,
    };
  }

  const prompt = `You are a senior software engineer reviewing a code change.

File: ${file.filename}
Status: ${file.status} (${file.additions} additions, ${file.deletions} deletions)

Here is the diff (lines starting with + are added, - are removed):
${file.patch}

Review this diff and respond ONLY with a valid JSON object in this exact format, no other text:
{
  "issues": [
    {
      "line": "approximate line number or null",
      "severity": "critical or warning or info",
      "category": "bug or security or performance or style",
      "message": "clear description of the issue",
      "suggestion": "how to fix it"
    }
  ],
  "summary": "one sentence summary of what this file change does",
  "score": {
    "security": 8,
    "readability": 7,
    "performance": 8
  }
}
If there are no issues, return an empty issues array. Only respond with JSON.`;

  try {
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5-coder:7b",
        prompt: prompt,
        stream: false,
      }),
    });

    const ollamaData = await ollamaRes.json();
    const rawText = ollamaData.response;

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        filename: file.filename,
        issues: [],
        summary: "Could not parse AI response",
        score: { security: 0, readability: 0, performance: 0 },
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return { filename: file.filename, ...parsed };
  } catch {
    return {
      filename: file.filename,
      issues: [],
      summary: "AI review failed for this file",
      score: { security: 0, readability: 0, performance: 0 },
    };
  }
}

function buildResult(owner, repo, pullNumber, reviewableFiles, fileReviews) {
  const scoredFiles = fileReviews.filter((f) => !f.skipped && f.score);
  const avgScore =
    scoredFiles.length > 0
      ? {
          security: Math.round(
            scoredFiles.reduce((s, f) => s + (f.score?.security ?? 0), 0) /
              scoredFiles.length
          ),
          readability: Math.round(
            scoredFiles.reduce((s, f) => s + (f.score?.readability ?? 0), 0) /
              scoredFiles.length
          ),
          performance: Math.round(
            scoredFiles.reduce((s, f) => s + (f.score?.performance ?? 0), 0) /
              scoredFiles.length
          ),
        }
      : { security: 0, readability: 0, performance: 0 };

  const allIssues = fileReviews.flatMap((f) => f.issues ?? []);
  const criticalCount = allIssues.filter(
    (i) => i.severity === "critical"
  ).length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;

  return {
    pr: { owner, repo, pullNumber },
    filesReviewed: reviewableFiles.length,
    fileReviews,
    overallScore: avgScore,
    summary: {
      totalIssues: allIssues.length,
      critical: criticalCount,
      warnings: warningCount,
      info: allIssues.length - criticalCount - warningCount,
    },
  };
}

export async function POST(request) {
  try {
    const { prUrl } = await request.json();

    if (!prUrl) {
      return Response.json({ error: "No PR URL provided" }, { status: 400 });
    }

    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      return Response.json({ error: "Invalid GitHub PR URL" }, { status: 400 });
    }

    const [, owner, repo, pullNumber] = match;

    fetch(`${GITHUB_API_BASE}/rate_limit`).then((res) => res.json());

    const githubHeaders = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "pr-reviewer-app",
    };
    if (process.env.GITHUB_TOKEN) {
      githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const githubRes = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
      { headers: githubHeaders }
    );

    if (!githubRes.ok) {
      return Response.json(
        { error: "Could not fetch PR from GitHub. Is it a public repo?" },
        { status: 400 }
      );
    }

    const files = await githubRes.json();
    const reviewableFiles = files.filter(
      (f) => !skipPatterns.some((pattern) => pattern.test(f.filename))
    );

    if (reviewableFiles.length === 0) {
      return Response.json({
        error: "No reviewable files found in this PR",
      });
    }

    const filesToReview = reviewableFiles.slice(0, 10);
    const filenames = filesToReview.map((f) => f.filename);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        try {
          send({
            type: "progress",
            files: filenames,
            filesReviewed: reviewableFiles.length,
          });

          const fileReviews = [];
          for (const file of filesToReview) {
            const review = await reviewFile(file);
            fileReviews.push(review);
            send({ type: "fileComplete", filename: file.filename });
          }

          send({
            type: "done",
            ...buildResult(owner, repo, pullNumber, reviewableFiles, fileReviews),
          });
        } catch (err) {
          send({ type: "error", error: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
