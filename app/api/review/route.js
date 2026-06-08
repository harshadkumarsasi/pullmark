const GITHUB_API_BASE = "https://api.github.com";

const skipPatterns = [
  /package-lock\.json/,
  /yarn\.lock/,
  /\.min\.js/,
  /\.map$/,
  /dist\//,
  /build\//,
];

const codingStandardFiles = [
  ".eslintrc",
  ".eslintrc.json",
  ".prettierrc",
  ".editorconfig",
  "CONTRIBUTING.md",
];

const MAX_PROJECT_TREE_FILES = 50;
const MAX_CODING_STANDARDS_CHARS = 500;
const CONTEXT_LINE_RADIUS = 10;
const MAX_PROMPT_CHARS = 3000;

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeContent(content) {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

async function fetchGithubJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function fetchRepoContent(owner, repo, path, ref, headers) {
  const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await fetchGithubJson(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodePath(
      path
    )}${refParam}`,
    headers
  );

  if (!data || Array.isArray(data) || data.type !== "file" || !data.content) {
    return null;
  }

  return decodeContent(data.content);
}

async function fetchProjectTree(owner, repo, branch, headers) {
  if (!branch) return [];

  const data = await fetchGithubJson(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      branch
    )}?recursive=1`,
    headers
  );

  return (data?.tree ?? [])
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path);
}

async function fetchCodingStandards(owner, repo, branch, headers) {
  const entries = await Promise.all(
    codingStandardFiles.map(async (filename) => {
      const content = await fetchRepoContent(owner, repo, filename, branch, headers);
      return content ? { filename, content } : null;
    })
  );

  return entries.filter(Boolean);
}

function parsePatchHunks(patch) {
  const hunks = [];
  const hunkPattern = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
  let match;

  while ((match = hunkPattern.exec(patch)) !== null) {
    hunks.push({
      oldStart: Number(match[1]),
      oldLength: Number(match[2] ?? 1),
      newStart: Number(match[3]),
      newLength: Number(match[4] ?? 1),
    });
  }

  return hunks;
}

function extractSurroundingContext(fileContent, patch) {
  if (!fileContent || !patch) return [];

  const lines = fileContent.split("\n");
  return parsePatchHunks(patch).map((hunk) => {
    const anchor = hunk.oldLength > 0 ? hunk.oldStart : hunk.newStart;
    const startLine = Math.max(1, anchor - CONTEXT_LINE_RADIUS);
    const endLine = Math.min(
      lines.length,
      anchor + Math.max(hunk.oldLength, 1) + CONTEXT_LINE_RADIUS
    );
    const snippet = lines
      .slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`)
      .join("\n");

    return {
      changedSection: `-${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength}`,
      startLine,
      endLine,
      snippet,
    };
  });
}

function dirname(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function basename(path) {
  return path.split("/").pop() ?? path;
}

function relatedCandidates(filename) {
  const candidates = new Set();
  const dir = dirname(filename);
  const name = basename(filename);

  if (name === "auth.js") {
    for (const relatedName of ["middleware.js", "routes.js"]) {
      candidates.add(dir ? `${dir}/${relatedName}` : relatedName);
      candidates.add(relatedName);
    }
  }

  const parts = filename.split("/");
  const componentsIndex = parts.indexOf("components");
  if (componentsIndex !== -1) {
    const closestDir = dirname(filename);
    if (closestDir && name !== "index.js") {
      candidates.add(`${closestDir}/index.js`);
    }

    const componentRoot = parts.slice(0, componentsIndex + 1).join("/");
    candidates.add(`${componentRoot}/index.js`);
  }

  candidates.delete(filename);
  return [...candidates];
}

async function fetchRelatedFiles(owner, repo, filename, branch, headers) {
  const entries = await Promise.all(
    relatedCandidates(filename).map(async (relatedPath) => {
      const content = await fetchRepoContent(owner, repo, relatedPath, branch, headers);
      return content ? { filename: relatedPath } : null;
    })
  );

  return entries.filter(Boolean);
}

async function buildFileContext(owner, repo, file, branch, headers) {
  const [baseContent, relatedFiles] = await Promise.all([
    fetchRepoContent(owner, repo, file.filename, branch, headers),
    fetchRelatedFiles(owner, repo, file.filename, branch, headers),
  ]);

  return {
    surroundingContext: extractSurroundingContext(baseContent, file.patch),
    relatedFiles,
  };
}

function formatCodingStandards(codingStandards) {
  if (codingStandards.length === 0) return "No coding standard files found.";

  const formatted = codingStandards
    .map(
      (file) => `--- ${file.filename} ---\n${file.content}`
    )
    .join("\n\n");

  if (formatted.length <= MAX_CODING_STANDARDS_CHARS) return formatted;

  return `${formatted.slice(0, MAX_CODING_STANDARDS_CHARS)}\n...truncated`;
}

function formatSurroundingContext(surroundingContext) {
  if (surroundingContext.length === 0) {
    return "No surrounding context available.";
  }

  return surroundingContext
    .map(
      (context) =>
        `Changed section ${context.changedSection}, base lines ${context.startLine}-${context.endLine}:\n${context.snippet}`
    )
    .join("\n\n");
}

function formatRelatedFiles(relatedFiles) {
  if (relatedFiles.length === 0) return "No obvious related files found.";

  return relatedFiles.map((file) => file.filename).join("\n");
}

function relevantProjectFiles(fileTree, filename) {
  const selected = new Set();
  const fileDir = dirname(filename);
  const rootConfigPatterns = [
    /^package\.json$/,
    /^tsconfig\.json$/,
    /^next\.config\./,
    /^vite\.config\./,
    /^src\//,
    /^app\//,
    /^pages\//,
    /^components\//,
    /^lib\//,
  ];

  const addMatches = (predicate) => {
    for (const path of fileTree) {
      if (selected.size >= MAX_PROJECT_TREE_FILES) return;
      if (predicate(path)) selected.add(path);
    }
  };

  addMatches((path) => path === filename);
  addMatches((path) => fileDir && dirname(path) === fileDir);
  addMatches((path) => codingStandardFiles.includes(path));
  addMatches((path) => rootConfigPatterns.some((pattern) => pattern.test(path)));
  addMatches(() => true);

  return [...selected].slice(0, MAX_PROJECT_TREE_FILES);
}

function responseFormatInstructions() {
  return `Review this diff and respond ONLY with a valid JSON object in this exact format, no other text:
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
}

function buildDiffOnlyPrompt(file) {
  return `You are a senior software engineer reviewing a code change.

File: ${file.filename}
Status: ${file.status} (${file.additions} additions, ${file.deletions} deletions)

Here is the diff (lines starting with + are added, - are removed):
${file.patch}

${responseFormatInstructions()}`;
}

function buildContextPrompt(file, context) {
  const projectFiles = relevantProjectFiles(context.fileTree, file.filename);

  return `You are a senior software engineer reviewing a code change.

File: ${file.filename}
Status: ${file.status} (${file.additions} additions, ${file.deletions} deletions)

Project file tree:
${projectFiles.join("\n")}

Coding standards found:
${formatCodingStandards(context.codingStandards)}

Surrounding code from the base branch:
${formatSurroundingContext(context.surroundingContext)}

Related files:
${formatRelatedFiles(context.relatedFiles)}

Here is the diff (lines starting with + are added, - are removed):
${file.patch}

${responseFormatInstructions()}`;
}

function promptForFile(file, context) {
  const prompt = buildContextPrompt(file, context);
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;

  return buildDiffOnlyPrompt(file);
}

function parseReviewResponse(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI returned invalid JSON");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

async function callGroq(prompt) {
  const groqRes = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    }
  );

  const groqData = await groqRes.json();
  return groqData.choices[0].message.content;
}

async function reviewFile(file, context) {
  if (!file.patch) {
    return {
      filename: file.filename,
      status: file.status,
      issues: [],
      skipped: true,
    };
  }

  try {
    const surroundingContextLineCount = context.surroundingContext.reduce(
      (count, item) => count + item.snippet.split("\n").length,
      0
    );

    console.log(`Reviewing: ${file.filename}`);
    console.log(`Project files found: ${context.fileTree.length}`);
    console.log(
      `Coding standards found: ${
        context.codingStandards.map((item) => item.filename).join(", ") ||
        "none"
      }`
    );
    console.log(`Surrounding context lines: ${surroundingContextLineCount}`);

    const prompt = promptForFile(file, context);

    try {
      const rawText = await callGroq(prompt);
      const parsed = parseReviewResponse(rawText);
      return { filename: file.filename, ...parsed };
    } catch (err) {
      if (err instanceof Error && err.message !== "AI returned invalid JSON") {
        throw err;
      }

      const rawText = await callGroq(buildDiffOnlyPrompt(file));
      const parsed = parseReviewResponse(rawText);
      return { filename: file.filename, ...parsed };
    }
  } catch {
    return {
      filename: file.filename,
      issues: [],
      summary: "AI review failed for this file",
      score: { security: 0, readability: 0, performance: 0 },
    };
  }
}

function buildResult(owner, repo, pullNumber, prTitle, reviewableFiles, fileReviews) {
  const scoredFiles = fileReviews.filter(
    (f) => !f.skipped && f.score && (f.score.security > 0 || f.score.readability > 0 || f.score.performance > 0)
  );
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
    pr: { owner, repo, pullNumber, title: prTitle },
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

    const githubHeaders = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "pr-reviewer-app",
    };
    if (process.env.GITHUB_TOKEN) {
      githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    fetch(`${GITHUB_API_BASE}/rate_limit`, { headers: githubHeaders }).then((res) => res.json());

    const [githubRes, prRes] = await Promise.all([
      fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
        { headers: githubHeaders }
      ),
      fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${pullNumber}`,
        { headers: githubHeaders }
      ),
    ]);

    if (!githubRes.ok) {
      return Response.json(
        { error: "Could not fetch PR from GitHub. Is it a public repo?" },
        { status: 400 }
      );
    }

    const files = await githubRes.json();
    const prData = prRes.ok ? await prRes.json() : null;
    const prTitle = prData?.title ?? `PR #${pullNumber}`;
    const baseBranch = prData?.base?.ref;
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
    const [fileTree, codingStandards] = await Promise.all([
      fetchProjectTree(owner, repo, baseBranch, githubHeaders),
      fetchCodingStandards(owner, repo, baseBranch, githubHeaders),
    ]);

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
            const fileContext = await buildFileContext(
              owner,
              repo,
              file,
              baseBranch,
              githubHeaders
            );
            const review = await reviewFile(file, {
              fileTree,
              codingStandards,
              ...fileContext,
            });
            fileReviews.push(review);
            send({ type: "fileComplete", filename: file.filename });
          }

          send({
            type: "done",
            ...buildResult(
              owner,
              repo,
              pullNumber,
              prTitle,
              reviewableFiles,
              fileReviews
            ),
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
