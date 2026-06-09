"use client";

import { useState, useSyncExternalStore } from "react";

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
  pr: { owner: string; repo: string; pullNumber: string; title: string };
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

type HistoryEntry = {
  id: string;
  repoName: string;
  title: string;
  result: ReviewResult;
  reviewedAt: number;
};

type StreamEvent =
  | { type: "progress"; files: string[]; filesReviewed: number }
  | { type: "fileComplete"; filename: string }
  | ({ type: "done" } & ReviewResult)
  | { type: "error"; error: string };

const HISTORY_KEY = "pr-review-history";
const HISTORY_CHANGE_EVENT = "pr-review-history-change";
const EMPTY_HISTORY: HistoryEntry[] = [];
let cachedHistoryRaw: string | null = null;
let cachedHistorySnapshot: HistoryEntry[] = EMPTY_HISTORY;

const severityStyles: Record<Issue["severity"], string> = {
  critical: "border-red-500/25 bg-red-500/10 text-red-300",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-200",
};

function overallAverage(score: ReviewResult["overallScore"]) {
  return (score.security + score.readability + score.performance) / 3;
}

function formatScore(score: number) {
  return score.toFixed(1);
}

function scoreTone(score: number) {
  if (score < 6) {
    return "border-red-500/25 bg-red-500/10 text-red-300";
  }

  if (score <= 8) {
    return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  }

  return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

function reviewUrl(result: ReviewResult) {
  return `https://github.com/${result.pr.owner}/${result.pr.repo}/pull/${result.pr.pullNumber}`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function historyId(result: ReviewResult) {
  return `${result.pr.owner}/${result.pr.repo}#${result.pr.pullNumber}`;
}

function loadHistory(): HistoryEntry[] {
  try {
    if (typeof window === "undefined") return EMPTY_HISTORY;

    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw === cachedHistoryRaw) return cachedHistorySnapshot;

    cachedHistoryRaw = raw;
    cachedHistorySnapshot = raw
      ? (JSON.parse(raw) as HistoryEntry[])
      : EMPTY_HISTORY;
    return cachedHistorySnapshot;
  } catch {
    cachedHistoryRaw = null;
    cachedHistorySnapshot = EMPTY_HISTORY;
    return cachedHistorySnapshot;
  }
}

function saveHistory(history: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT));
}

function subscribeHistory(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(HISTORY_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HISTORY_CHANGE_EVENT, callback);
  };
}

function getServerHistorySnapshot() {
  return EMPTY_HISTORY;
}

function addToHistory(result: ReviewResult): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: historyId(result),
    repoName: `${result.pr.owner}/${result.pr.repo}`,
    title: result.pr.title,
    result,
    reviewedAt: Date.now(),
  };
  const history = loadHistory().filter((h) => h.id !== entry.id);
  const updated = [entry, ...history];
  saveHistory(updated);
  return updated;
}

function stripStreamType(event: { type: "done" } & ReviewResult): ReviewResult {
  return {
    pr: event.pr,
    filesReviewed: event.filesReviewed,
    fileReviews: event.fileReviews,
    overallScore: event.overallScore,
    summary: event.summary,
  };
}

export default function Home() {
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const history = useSyncExternalStore(
    subscribeHistory,
    loadHistory,
    getServerHistorySnapshot
  );
  const [files, setFiles] = useState<string[]>([]);
  const [filesReviewed, setFilesReviewed] = useState(0);
  const [completedFiles, setCompletedFiles] = useState<string[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  function handleNewReview() {
    setResult(null);
    setActiveId(null);
    setExpandedFile(null);
    setError(null);
  }

  function handleSelectHistory(entry: HistoryEntry) {
    setResult(entry.result);
    setActiveId(entry.id);
    setExpandedFile(null);
    setError(null);
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!prUrl.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setActiveId(null);
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
            const reviewResult = stripStreamType(event);
            setResult(reviewResult);
            setActiveId(historyId(reviewResult));
            addToHistory(reviewResult);
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
    <div className="flex min-h-screen bg-[#0a0a0a] font-sans text-zinc-100">
      <aside className="flex min-h-screen w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a]">
        <div className="border-b border-white/10 p-4">
          <button
            type="button"
            onClick={handleNewReview}
            className="mb-5 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[15px] font-semibold tracking-tight text-white"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-white text-xs font-bold text-black">
              PR
            </span>
            PRReview
          </button>
          <button
            type="button"
            onClick={handleNewReview}
            className="w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm font-medium text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] transition-colors hover:bg-zinc-200"
          >
            New review
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {history.length === 0 ? (
            <p className="px-2 py-4 text-sm text-zinc-500">No reviews yet</p>
          ) : (
            <ul className="space-y-1">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectHistory(entry)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      activeId === entry.id
                        ? "border border-white/10 bg-white/[0.08]"
                        : "border border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {entry.repoName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {entry.title}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                      {formatDate(entry.reviewedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col bg-[#0d0d0d] text-zinc-100">
        <main
          className={`flex flex-1 flex-col px-10 py-14 ${
            result ? "items-stretch" : "items-center justify-center"
          }`}
          style={{
            backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        >
          {result ? (
            <div className="mx-auto w-full max-w-7xl">
              <div className="mb-8">
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  Review complete
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white">
                  {result.pr.title}
                </h1>
                <p className="mt-3 break-all font-mono text-sm text-zinc-500">
                  {reviewUrl(result)}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                    className={`rounded-lg border p-4 shadow-sm ${scoreTone(score)}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
                      {label}
                    </p>
                    <p className="mt-3 text-4xl font-semibold tracking-tight">
                      {formatScore(score)}
                      <span className="ml-1 text-base font-medium text-zinc-400">
                        /10
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-sm font-medium text-red-300">
                  Critical {result.summary.critical}
                </span>
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-200">
                  Warning {result.summary.warnings}
                </span>
                <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-sm font-medium text-sky-200">
                  Info {result.summary.info}
                </span>
              </div>

              <div className="mt-8 space-y-3">
                {result.fileReviews.map((file) => {
                  const isExpanded = expandedFile === file.filename;
                  const issueCount = file.issues?.length ?? 0;

                  return (
                    <div
                      key={file.filename}
                      className="overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedFile(isExpanded ? null : file.filename)
                        }
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.04]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm font-medium text-white">
                            {file.filename}
                          </span>
                          {file.summary && (
                            <span className="mt-1 block truncate text-sm text-zinc-400">
                              {file.summary}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-400">
                          <span>
                            {issueCount}{" "}
                            {issueCount === 1 ? "issue" : "issues"}
                          </span>
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
                        <div className="border-t border-white/10 bg-[#111111] px-4 py-4">
                          {issueCount === 0 ? (
                            <p className="text-sm text-zinc-400">
                              No issues found.
                            </p>
                          ) : (
                            <ul className="space-y-3">
                              {file.issues!.map((issue, i) => (
                                <li
                                  key={i}
                                  className="rounded-md border border-white/10 bg-[#1a1a1a] p-4"
                                >
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${severityStyles[issue.severity]}`}
                                    >
                                      {issue.severity} · {issue.category}
                                    </span>
                                    {issue.line != null && (
                                      <span className="font-mono text-xs text-zinc-500">
                                        line {issue.line}
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium leading-6 text-white">
                                      {issue.message}
                                    </p>
                                    {issue.suggestion && (
                                      <p className="mt-2 text-sm leading-6 text-zinc-300">
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
            <div className="w-full max-w-5xl">
              <div className="text-center">
                <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Structured AI review for GitHub pull requests
                </p>
                <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  Drop a PR URL.
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
                  Get a focused review across security, readability, and
                  performance with file-level findings ready for triage.
                </p>
              </div>

              <form
                onSubmit={handleReview}
                className="mx-auto mt-12 flex max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] p-1.5 shadow-sm focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5"
              >
                <input
                  type="url"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/pull/123"
                  required
                  disabled={loading}
                  className="min-w-0 flex-1 bg-transparent px-5 py-4 font-mono text-sm text-white outline-none placeholder:text-zinc-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-white px-6 py-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && (
                    <svg
                      className="h-4 w-4 animate-spin"
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
                  Review PR →
                </button>
              </form>

              <div className="mx-auto mt-9 flex max-w-4xl flex-wrap justify-center gap-x-10 gap-y-3 text-center font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#666]">
                <p className="whitespace-nowrap">MAX FILES / PR: 30</p>
                <p className="whitespace-nowrap">
                  CATEGORIES: Security · Read · Perf
                </p>
                <p className="whitespace-nowrap">OUTPUT: JSON · structured</p>
              </div>

              {error && (
                <p className="mt-5 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              )}

              {loading && files.length > 0 && (
                <div className="mt-10 text-left">
                  <p className="mb-3 text-sm font-medium text-zinc-400">
                    Reviewing {files.length} of {filesReviewed} files
                  </p>
                  <ul className="space-y-2 rounded-lg border border-white/10 bg-[#1a1a1a] p-4 shadow-sm">
                    {files.map((filename) => {
                      const isComplete = completedSet.has(filename);
                      const isActive = filename === activeFile;

                      return (
                        <li
                          key={filename}
                          className="flex items-center gap-3 font-mono text-sm text-zinc-300"
                        >
                          {isComplete ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          ) : isActive ? (
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
                          ) : (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-600" />
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
    </div>
  );
}
