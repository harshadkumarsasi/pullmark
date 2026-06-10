import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    return NextResponse.json([])
  }

  const reviews = await prisma.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      fileResults: true,
    },
  })

  return NextResponse.json(
    reviews.map((review) => ({
      id: review.id,
      prUrl: review.prUrl,
      prOwner: review.prOwner,
      prRepo: review.prRepo,
      prNumber: review.prNumber,
      prTitle: review.prTitle,
      createdAt: review.createdAt,
      result: {
        pr: {
          owner: review.prOwner,
          repo: review.prRepo,
          pullNumber: review.prNumber,
          title: review.prTitle ?? `PR #${review.prNumber}`,
        },
        filesReviewed: review.filesReviewed,
        fileReviews: review.fileResults.map((file) => ({
          filename: file.filename,
          summary: file.summary,
          issues: file.issues ?? [],
          score:
            file.securityScore != null ||
            file.readabilityScore != null ||
            file.performanceScore != null
              ? {
                  security: file.securityScore ?? 0,
                  readability: file.readabilityScore ?? 0,
                  performance: file.performanceScore ?? 0,
                }
              : undefined,
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
      },
    }))
  )
}
