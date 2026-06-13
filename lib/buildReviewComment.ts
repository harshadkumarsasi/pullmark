import { prisma } from "@/lib/prisma"

export async function buildReviewComment(reviewId: string): Promise<string> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { fileResults: true },
  })

  if (!review) {
    throw new Error("Review not found")
  }

  const fileResults = review.fileResults ?? []

  // Find the single highest-severity issue across all file results
  const severityOrder = ["critical", "warning", "info"] as const
  let topIssue: {
    filename: string
    issue: {
      line: number | null
      severity: string
      category: string
      message: string
      suggestion: string
    }
  } | null = null

  outer: for (const sev of severityOrder) {
    for (const file of fileResults) {
      const issues = (file.issues as Array<{
        line: number | null
        severity: string
        category: string
        message: string
        suggestion: string
      }>) ?? []
      for (const issue of issues) {
        if (issue.severity === sev) {
          topIssue = { filename: file.filename, issue }
          break outer
        }
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (review.totalIssues === 0) {
    return `Reviewed this PR — looks solid overall (scoring ${review.overallScore}/10). No major issues found.

Full breakdown: ${baseUrl}/review/${reviewId}`
  } else if (topIssue) {
    const lineText =
      topIssue.issue.line != null
        ? ` around line ${topIssue.issue.line}`
        : ""
    const extraIssues =
      review.totalIssues > 1
        ? `Found ${review.totalIssues - 1} other smaller thing(s) too. `
        : ""

    return `Took a look at this PR (overall score: ${review.overallScore}/10 — security ${review.securityScore}, readability ${review.readabilityScore}, performance ${review.performanceScore}).

One thing worth fixing: **${topIssue.issue.message}** in \`${topIssue.filename}\`${lineText}.
${topIssue.issue.suggestion}

${extraIssues}Full review with all details: ${baseUrl}/review/${reviewId}`
  } else {
    // Fallback: totalIssues > 0 but no topIssue found (shouldn't happen)
    return `Took a look at this PR (overall score: ${review.overallScore}/10 — security ${review.securityScore}, readability ${review.readabilityScore}, performance ${review.performanceScore}).

Full review with all details: ${baseUrl}/review/${reviewId}`
  }
}