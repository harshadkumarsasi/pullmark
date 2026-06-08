"use client";

import { useState } from "react";

type Issue = {
  line: string | number | null;
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  suggestion: string;
};

type FileReview = {
  filename: string;
  issues?: Issue[];
  summary?: string;
  score?: { security: number; readability: number; performance: number };
  skipped?: boolean;
};

type ReviewResult = {
  pr: { owner: string; repo: string; pullNumber: string };
  filesReviewed: number;
  fileReviews: FileReview[];
  overallScore: { security: number; readability: number; performance: number };
  summary: {
    totalIssues: number;
    critical: number;
    warnings: number;
    info: number;
  };
};

type StreamEvent =
  | { type: "progress"; files: string[]; filesReviewed: number }
  | { type: "fileComplete"; filename: string }
  | ({ type: "done" } & ReviewResult)
  | { type: "error"; error: string };

const severityDot: Record<Issue["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-yellow-400",
  info: "bg-blue-500",
};

function overallAverage(score: ReviewResult["overallScore"]) {
  return Math.round(
    (score.security + score.readability + score.performance) / 3
  );
}

export default function Home() {
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [filesReviewed, setFilesReviewed] = useState(0);
  const [completedFiles, setCompletedFiles] = useState<string[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!prUrl.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFiles([]);
    setFilesReviewed(0);
    setCompletedFiles([]);
    setExpandedFile(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl: prUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Review failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;

          if (event.type === "progress") {
            setFiles(event.files);
            setFilesReviewed(event.filesReviewed);
          } else if (event.type === "fileComplete") {
            setCompletedFiles((prev) => [...prev, event.filename]);
          } else if (event.type === "done") {
            const { type: _, ...reviewResult } = event;
            setResult(reviewResult);
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
  }

  const completedSet = new Set(completedFiles);
  const activeFile = files.find((f) => !completedSet.has(f));

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <nav className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          PRReview
        </span>
      </nav>

      <main
        className={`flex flex-1 flex-col px-6 py-16 ${
          result ? "items-stretch" : "items-center justify-center"
        }`}
      >
        {result ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  Review Results
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {result.pr.owner}/{result.pr.repo} #{result.pr.pullNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Review another PR
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(
                [
                  ["Security", result.overallScore.security],
                  ["Readability", result.overallScore.readability],
                  ["Performance", result.overallScore.performance],
                  ["Overall", overallAverage(result.overallScore)],
                ] as const
              ).map(([label, score]) => (
                <div
                  key={label}
                  className="rounded-lg border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {label}
                  </p>
                  <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                    {score}
                    <span className="text-lg font-normal text-zinc-400">/10</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                {result.summary.critical} critical
              </span>
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
                {result.summary.warnings} warnings
              </span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                {result.summary.info} info
              </span>
            </div>

            <div className="mt-8 space-y-3">
              {result.fileReviews.map((file) => {
                const isExpanded = expandedFile === file.filename;
                const issueCount = file.issues?.length ?? 0;

                return (
                  <div
                    key={file.filename}
                    className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFile(isExpanded ? null : file.filename)
                      }
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span className="truncate font-mono text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {file.filename}
                      </span>
                      <span className="ml-4 flex shrink-0 items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        {issueCount} {issueCount === 1 ? "issue" : "issues"}
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                        {file.summary && (
                          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                            {file.summary}
                          </p>
                        )}
                        {issueCount === 0 ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No issues found.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {file.issues!.map((issue, i) => (
                              <li key={i} className="flex gap-3">
                                <span
                                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot[issue.severity]}`}
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                    {issue.message}
                                    {issue.line != null && (
                                      <span className="ml-2 font-normal text-zinc-400">
                                        line {issue.line}
                                      </span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                    {issue.category}
                                  </p>
                                  {issue.suggestion && (
                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                                      {issue.suggestion}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
              AI code review for any GitHub PR
            </h1>

            <form
              onSubmit={handleReview}
              className="mt-10 flex flex-col gap-3 sm:flex-row"
            >
              <input
                type="url"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                required
                disabled={loading}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading && (
                  <svg
                    className="h-5 w-5 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                Review PR
              </button>
            </form>

            {error && (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {loading && files.length > 0 && (
              <div className="mt-10 text-left">
                <p className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Reviewing {files.length} of {filesReviewed} files
                </p>
                <ul className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  {files.map((filename) => {
                    const isComplete = completedSet.has(filename);
                    const isActive = filename === activeFile;

                    return (
                      <li
                        key={filename}
                        className="flex items-center gap-3 font-mono text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        {isComplete ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        ) : isActive ? (
                          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
                        ) : (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        )}
                        <span className="truncate">{filename}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
