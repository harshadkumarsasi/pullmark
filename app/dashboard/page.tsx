"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import PostToGitHubButton from "../review/[id]/PostToGitHubButton";
import styles from "./dashboard.module.css";

type ReviewScore = {
  security: number;
  readability: number;
  performance: number;
};

type ReviewIssue = {
  line: number | null;
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  suggestion: string;
};

type FileReview = {
  filename: string;
  summary?: string | null;
  issues: ReviewIssue[];
  score?: ReviewScore;
  skipped?: boolean;
};

type ReviewResult = {
  pr: {
    owner: string;
    repo: string;
    pullNumber: string;
    title: string;
  };
  reviewId?: string;
  filesReviewed: number;
  fileReviews: FileReview[];
  overallScore: ReviewScore;
  summary: {
    totalIssues: number;
    critical: number;
    warnings: number;
    info: number;
  };
};

type HistoryEntry = {
  id: string;
  prUrl: string;
  prOwner: string;
  prRepo: string;
  prNumber: string;
  prTitle: string | null;
  createdAt: string | Date;
  result: ReviewResult;
};

function formatDate(timestamp: string | Date) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (isNaN(date.getTime())) return "Recently"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function formatScore(score: number) {
  return score.toFixed(1);
}

const QUALITY_COLORS = {
  strong: "#22c55e",
  fair: "#f59e0b",
  poor: "#ef4444",
} as const;

function scoreColor(score: number) {
  if (score >= 8) return QUALITY_COLORS.strong;
  if (score >= 6) return QUALITY_COLORS.fair;
  return QUALITY_COLORS.poor;
}

function scoreQuality(score: number) {
  if (score >= 8) return { label: "Strong", cls: styles.qualityBadgeStrong };
  if (score >= 6) return { label: "Fair", cls: styles.qualityBadgeFair };
  return { label: "Poor", cls: styles.qualityBadgePoor };
}

function scoreProgress(score: number) {
  return Math.round(score * 10) + "%";
}

function reviewUrl(result: ReviewResult) {
  return `https://github.com/${result.pr.owner}/${result.pr.repo}/pull/${result.pr.pullNumber}`;
}

function getPillClass(severity: string, count: number) {
  if (count === 0) return styles.issuePillZero;
  if (severity === "critical") return styles.issuePillCritical;
  if (severity === "warning") return styles.issuePillWarning;
  return styles.issuePillInfo;
}

function getPillSmallClass(severity: string) {
  if (severity === "critical") return styles.issuePillSmallCritical;
  if (severity === "warning") return styles.issuePillSmallWarning;
  return styles.issuePillSmallInfo;
}

function getSeverityIcon(severity: string) {
  if (severity === "critical") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="6" fill="#ef4444" />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <polygon points="6,1 11,10 1,10" fill="#f59e0b" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="#6b9eff" strokeWidth="1.5" />
    </svg>
  );
}

export default function DashboardPage() {
  const [prUrl, setPrUrl] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [filesReviewed, setFilesReviewed] = useState(0);
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [usingStaticGithubToken, setUsingStaticGithubToken] = useState<boolean | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);
  const shareResetTimeout = useRef<number | null>(null);

  useEffect(() => {
    refreshHistory();
  }, []);

  async function refreshHistory() {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to load review history.");
      }
      const data = (await response.json()) as HistoryEntry[];
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSelectHistory(entry: HistoryEntry) {
    setActiveId(entry.id);
    setError(null);
    setShareMessage(null);
    if (shareResetTimeout.current) {
      window.clearTimeout(shareResetTimeout.current);
      shareResetTimeout.current = null;
    }

    try {
      const reviewResult = await loadReviewById(entry.id)
      setResult(reviewResult)
      setCurrentReviewId(entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleNewReview() {
    setActiveId(null);
    setResult(null);
    setCurrentReviewId(null);
    setShareMessage(null);
    if (shareResetTimeout.current) {
      window.clearTimeout(shareResetTimeout.current);
      shareResetTimeout.current = null;
    }
    setError(null);
  }

  async function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setFiles([]);
    setCompletedSet(new Set());
    setFilesReviewed(0);
    setActiveFile(null);
    setShareMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prUrl }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Review request failed.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response stream unavailable.");
      }

      const decoder = new TextDecoder();
      let bufferedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        bufferedText += decoder.decode(value, { stream: true });
        const lines = bufferedText.split("\n");
        bufferedText = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === "progress") {
              setFiles(event.files || []);
              setFilesReviewed(event.filesReviewed ?? 0);
              if (typeof event.usingStaticGithubToken !== "undefined") {
                setUsingStaticGithubToken(Boolean(event.usingStaticGithubToken));
              }
            }

            if (event.type === "fileComplete") {
              setCompletedSet((prev) => new Set(prev).add(event.filename));
              setActiveFile(event.filename);
            }

                  if (event.type === "done") {
              setResult(event);
              setCurrentReviewId(event.reviewId ?? null);
              await refreshHistory();
            }

            if (event.type === "error") {
              throw new Error(event.error || "An unknown review error occurred.");
            }
          } catch (parseError) {
            console.error("Failed to parse review event", parseError);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadReviewById(id: string) {
    const response = await fetch(`/api/review/${id}`, { cache: "no-store" })
    if (!response.ok) {
      throw new Error("Unable to load review.")
    }

    const review = await response.json()

    return {
      pr: {
        owner: review.prOwner,
        repo: review.prRepo,
        pullNumber: review.prNumber,
        title: review.prTitle ?? `PR #${review.prNumber}`,
      },
      filesReviewed: review.filesReviewed,
      fileReviews: review.fileResults.map((file: any) => ({
        filename: file.filename,
        summary: file.summary,
        issues: file.issues ?? [],
        score: {
          security: file.securityScore ?? 0,
          readability: file.readabilityScore ?? 0,
          performance: file.performanceScore ?? 0,
        },
        skipped: file.skipped,
      })),
      overallScore: {
        security: review.securityScore,
        readability: review.readabilityScore,
        performance: review.performanceScore,
      },
      summary: {
        totalIssues: review.totalIssues,
        critical: review.criticalCount,
        warnings: review.warningCount,
        info: review.infoCount,
      },
    }
  }

  async function copyReviewLink() {
    if (!currentReviewId) return;

    const shareUrl = `${window.location.origin}/review/${currentReviewId}`

    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareMessage("Review link copied to clipboard.")
      if (shareResetTimeout.current) {
        window.clearTimeout(shareResetTimeout.current);
      }
      shareResetTimeout.current = window.setTimeout(() => {
        setShareMessage(null)
        shareResetTimeout.current = null
      }, 3000)
    } catch (err) {
      setShareMessage("Unable to copy link. Please copy it manually.")
      console.error(err)
    }
  }

  const prNumber = result?.pr?.pullNumber;
  const repoFull = result ? `${result.pr.owner}/${result.pr.repo}` : "";

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.logoRow}>
            <div className={styles.logoLeft}>
              <span className={styles.prBadge}>PR</span>
              <span className={styles.brandText}>Pullmark</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleNewReview}
            className={styles.newReviewBtn}
          >
            New review
          </button>
        </div>

        <div className={styles.historyLabel}>Recent reviews</div>

        <div className={styles.sidebarContent}>
          {loadingHistory && history.length === 0 ? (
            <p className={styles.loadingText}>Loading review history…</p>
          ) : history.length === 0 ? (
            <p className={styles.emptyText}>No reviews yet</p>
          ) : (
            <ul className={styles.historyList}>
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectHistory(entry)}
                    className={`${styles.historyItem} ${
                      activeId === entry.id ? styles.historyItemActive : ""
                    }`}
                  >
                    <div className={styles.historyItemTop}>
                      <span className={styles.historyBranchIcon}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="#44445a">
                          <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
                        </svg>
                      </span>
                      <p className={styles.historyRepo}>
                        {`${entry.prOwner}/${entry.prRepo}`}
                      </p>
                    </div>
                    <p className={styles.historyTitle}>
                      {entry.prTitle ?? `PR #${entry.prNumber}`}
                    </p>
                    <p className={styles.historyDate}>
                      {formatDate(entry.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarBottomRow}>
            <span className={styles.userAvatar}>?</span>
            <div className={styles.sidebarBottomInfo}>
              <span className={styles.userName}>Signed in</span>
              <span className={styles.userEmail}>Guest</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={styles.signOutBottomBtn}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className={styles.mainArea}>
        <main
          className={`${styles.mainInner} ${
            result ? styles.mainInnerStretched : styles.mainInnerCentered
          }`}
        >
          {result ? (
            <div className={styles.reviewContainer}>
              <div className={styles.reviewHeader}>
                {(result.pr.owner || result.pr.repo) && (
                  <div className={styles.breadcrumbRow}>
                    <span className={styles.breadcrumbRepo}>{repoFull}</span>
                    <span className={styles.breadcrumbSep}>/</span>
                    <span className={styles.breadcrumbPr}>#{prNumber}</span>
                  </div>
                )}
                <h1 className={styles.reviewTitle}>
                  {result.pr.title}
                </h1>
              </div>

              {usingStaticGithubToken === true && (
                <div className={styles.staticTokenNote}>
                  Note: using the static GitHub token. Private repositories require signing in with GitHub to review.
                </div>
              )}

              <div className={styles.scoreGrid}>
                {(
                  [
                    ["Security", result.overallScore.security],
                    ["Readability", result.overallScore.readability],
                    ["Performance", result.overallScore.performance],
                    ["Overall", Math.round((result.overallScore.security + result.overallScore.readability + result.overallScore.performance) / 3)],
                  ] as const
                ).map(([label, score]) => {
                  const quality = scoreQuality(score);
                  return (
                    <div key={label} className={styles.scoreCard}>
                      <div className={styles.scoreCardTop}>
                        <p className={styles.scoreLabel}>{label}</p>
                        <span className={`${styles.qualityBadge} ${quality.cls}`}>
                          {quality.label}
                        </span>
                      </div>
                      <p className={styles.scoreValue} style={{ color: scoreColor(score) }}>
                        {formatScore(score)}
                        <span className={styles.scoreDenominator}>/10</span>
                      </p>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: scoreProgress(score), background: scoreColor(score) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.issuePills}>
                <span className={`${styles.issuePill} ${getPillClass("critical", result.summary.critical)}`}>
                  <svg className={styles.issuePillIcon} width="10" height="10" viewBox="0 0 10 10">
                    <circle cx="5" cy="5" r="5" fill={result.summary.critical > 0 ? "#ef4444" : "#44445a"} />
                  </svg>
                  Critical {result.summary.critical}
                </span>
                <span className={`${styles.issuePill} ${getPillClass("warning", result.summary.warnings)}`}>
                  <svg className={styles.issuePillIcon} width="10" height="10" viewBox="0 0 10 10">
                    <polygon points="5,1 9.5,9 0.5,9" fill={result.summary.warnings > 0 ? "#f59e0b" : "#44445a"} />
                  </svg>
                  Warning {result.summary.warnings}
                </span>
                <span className={`${styles.issuePill} ${getPillClass("info", result.summary.info)}`}>
                  <svg className={styles.issuePillIcon} width="10" height="10" viewBox="0 0 10 10">
                    <circle cx="5" cy="5" r="4" fill="none" stroke={result.summary.info > 0 ? "#6b9eff" : "#44445a"} strokeWidth="1.5" />
                  </svg>
                  Info {result.summary.info}
                </span>
              </div>

              {currentReviewId && (
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    onClick={copyReviewLink}
                    className={styles.shareBtn}
                  >
                    Share this review
                  </button>
                  {result?.pr && (
                    <PostToGitHubButton reviewId={currentReviewId} initialPostCount={0} />
                  )}
                  {shareMessage && (
                    <span className={styles.shareMessage}>{shareMessage}</span>
                  )}
                </div>
              )}

              <div className={styles.filesHeader}>
                <span className={styles.filesHeaderLabel}>Files reviewed</span>
                <span className={styles.filesHeaderCount}>{result.fileReviews.length} files</span>
              </div>

              <div className={styles.fileCards}>
                {result.fileReviews.map((file) => {
                  const isExpanded = activeFile === file.filename;
                  const issueCount = file.issues?.length ?? 0;
                  const criticalCount = file.issues.filter(i => i.severity === "critical").length;
                  const warningCount = file.issues.filter(i => i.severity === "warning").length;
                  const infoCount = file.issues.filter(i => i.severity === "info").length;

                  return (
                    <div
                      key={file.filename}
                      className={styles.fileCard}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveFile(isExpanded ? null : file.filename)}
                        className={styles.fileHeader}
                      >
                        <span className={styles.fileHeaderLeft}>
                          <span className={styles.fileHeaderFirstLine}>
                            <span className={styles.fileIcon}>📄</span>
                            <span className={styles.fileFilename}>
                              {file.filename}
                            </span>
                          </span>
                          {file.summary && (
                            <span className={styles.fileSummary}>
                              {file.summary}
                            </span>
                          )}
                        </span>
                        <span className={styles.fileHeaderRight}>
                          <span className={styles.issueDots}>
                            {criticalCount > 0 && (
                              <span style={{width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: 'white', marginLeft: '3px'}}>{criticalCount}</span>
                            )}
                            {warningCount > 0 && (
                              <span style={{width: '18px', height: '18px', borderRadius: '50%', background: '#f59e0b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: 'white', marginLeft: '3px'}}>{warningCount}</span>
                            )}
                            {infoCount > 0 && (
                              <span style={{width: '18px', height: '18px', borderRadius: '50%', background: '#6b9eff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: 'white', marginLeft: '3px'}}>{infoCount}</span>
                            )}
                          </span>
                          <svg
                            className={`${styles.fileChevron} ${isExpanded ? styles.fileChevronOpen : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </button>

                      {isExpanded && (
                        <div className={styles.fileIssues}>
                          {issueCount === 0 ? (
                            <p className={styles.noIssues}>No issues found.</p>
                          ) : (
                            <div>
                              {file.issues.map((issue, i) => (
                                <div key={i} className={styles.issueItem}>
                                  <div className={styles.issueIconCol}>
                                    {getSeverityIcon(issue.severity)}
                                  </div>
                                  <div className={styles.issueContentCol}>
                                    <p className={styles.issueMessage}>
                                      {issue.message}
                                      {issue.line != null && (
                                        <span className={styles.issueLine}>L{issue.line}</span>
                                      )}
                                    </p>
                                    {issue.suggestion && issue.suggestion.toLowerCase() !== "none" && (
                                      <p className={styles.issueSuggestion}>{issue.suggestion}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : loading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinnerContainer}>
                <div className={styles.spinner} />
                <p className={styles.spinnerText}>Reviewing your PR…</p>
              </div>

              {files.length > 0 && (
                <div className={styles.loadingFiles}>
                  <p className={styles.loadingLabel}>
                    Reviewing {files.length} of {filesReviewed} files
                  </p>
                  <ul className={styles.fileList}>
                    {files.map((filename) => {
                      const isComplete = completedSet.has(filename);
                      const isActive = filename === activeFile;

                      return (
                        <li key={filename} className={styles.fileItem}>
                          <span
                            className={`${styles.fileDot} ${
                              isComplete
                                ? styles.fileDotDone
                                : isActive
                                ? styles.fileDotActive
                                : styles.fileDotPending
                            }`}
                          />
                          <span className={styles.fileName}>{filename}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {error && (
                <div className={styles.errorBox}>{error}</div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyBadge}>
                AI-powered pull request review
              </span>
              <h1 className={styles.emptyHeadline}>Review any pull request{"\n"}in seconds</h1>
              <p className={styles.emptySubtext}>
                Paste any GitHub PR URL below to get a structured AI review across security, readability, and performance.
              </p>

              <form
                onSubmit={handleReview}
                className={styles.inputRow}
              >
                <span className={styles.inputIcon}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </span>
                <input
                  type="url"
                  value={prUrl}
                  onChange={(event) => setPrUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo/pull/123"
                  required
                  disabled={loading}
                  className={styles.urlInput}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className={styles.submitBtn}
                >
                  {loading && (
                    <span className={styles.buttonSpinner} />
                  )}
                  Review →
                </button>
              </form>

              <div className={styles.inputMeta}>
                Try it with a sample PR — just press Review.
              </div>

              {error && (
                <div className={styles.errorBox}>{error}</div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}