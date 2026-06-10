import { prisma } from "@/lib/prisma"
import SignInButton from "./SignInButton"

type ReviewFileResult = {
  id: string
  filename: string
  summary: string | null
  issues: Array<{
    line: number | null
    severity: "critical" | "warning" | "info"
    category: string
    message: string
    suggestion: string
  }> | null
}

type Review = {
  id: string
  prUrl: string
  prTitle: string | null
  securityScore: number
  readabilityScore: number
  performanceScore: number
  overallScore: number
  totalIssues: number
  criticalCount: number
  warningCount: number
  infoCount: number
  fileResults: ReviewFileResult[]
}

function formatScore(score: number) {
  return score.toFixed(1)
}

function scoreTone(score: number) {
  if (score >= 8) return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
  if (score >= 5) return "border border-amber-400/20 bg-amber-400/10 text-amber-200"
  return "border border-rose-500/20 bg-rose-500/10 text-rose-200"
}

function formatUrl(url: string) {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const review = await prisma.review.findUnique({
    where: { id },
    include: { fileResults: true },
  })

  if (!review) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">
        <div className="rounded-3xl border border-white/10 bg-[#111111] p-10 text-center shadow-sm">
          <h1 className="text-3xl font-semibold">Review not found</h1>
          <p className="mt-4 text-sm text-zinc-400">The review you are looking for does not exist or has been removed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0d0d] text-zinc-100">
      <main
        className="mx-auto w-full max-w-6xl px-6 py-16"
        style={{
          backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Shared review
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              {review.prTitle ?? "GitHub Pull Request Review"}
            </h1>
            <p className="mt-3 break-all font-mono text-sm text-zinc-500">{formatUrl(review.prUrl)}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Security", review.securityScore],
                ["Readability", review.readabilityScore],
                ["Performance", review.performanceScore],
                ["Overall", review.overallScore],
              ] as const
            ).map(([label, score]) => (
              <div key={label} className={`rounded-lg border p-4 shadow-sm ${scoreTone(score)}`}>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">{label}</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight">
                  {formatScore(score)}
                  <span className="ml-1 text-base font-medium text-zinc-400">/10</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-sm font-medium text-red-300">
              Critical {review.criticalCount}
            </span>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-200">
              Warning {review.warningCount}
            </span>
            <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-sm font-medium text-sky-200">
              Info {review.infoCount}
            </span>
          </div>

          <div className="mt-8 space-y-4">
            {review.fileResults.map((file) => {
              const issues = Array.isArray(file.issues) ? file.issues : []
              const issueCount = issues.length

              return (
                <details
                  key={file.id}
                  className="overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-sm"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.04]">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-medium text-white">{file.filename}</span>
                      {file.summary && (
                        <span className="mt-1 block truncate text-sm text-zinc-400">{file.summary}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-400">
                      <span>{issueCount} {issueCount === 1 ? "issue" : "issues"}</span>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </summary>

                  <div className="border-t border-white/10 bg-[#111111] px-4 py-4">
                    {issueCount === 0 ? (
                      <p className="text-sm text-zinc-400">No issues found.</p>
                    ) : (
                      <ul className="space-y-3">
                        {issues.map((issue, index) => (
                          <li
                            key={index}
                            className="rounded-md border border-white/10 bg-[#1a1a1a] p-4"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90 bg-white/5">
                                {issue.severity} · {issue.category}
                              </span>
                              {issue.line != null && (
                                <span className="font-mono text-xs text-zinc-500">line {issue.line}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-6 text-white">{issue.message}</p>
                              {issue.suggestion && (
                                <p className="mt-2 text-sm leading-6 text-zinc-300">{issue.suggestion}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )
            })}
          </div>

          <SignInButton />
        </div>
      </main>
    </div>
  )
}
