import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { buildReviewComment } from "@/lib/buildReviewComment"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { accounts: true },
  })

  const githubAccount = user?.accounts?.find((a) => a.provider === "github")
  const githubToken = githubAccount?.access_token || process.env.GITHUB_TOKEN

  const review = await prisma.review.findUnique({
    where: { id },
    include: { fileResults: true },
  })

  if (!review) {
    return new Response(JSON.stringify({ error: "Review not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Read optional custom comment from request body
  let comment: string
  try {
    const body = await request.json()
    if (body.comment && typeof body.comment === "string" && body.comment.trim().length > 0) {
      comment = body.comment
    } else {
      comment = await buildReviewComment(id)
    }
  } catch {
    // If there's no body or parsing fails, fall back to generated comment
    comment = await buildReviewComment(id)
  }

  const response = await fetch(
    `https://api.github.com/repos/${review.prOwner}/${review.prRepo}/issues/${review.prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: comment }),
    }
  )

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Failed to post comment" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const updatedReview = await prisma.review.update({
    where: { id },
    data: { commentPostCount: { increment: 1 } },
  })

  return Response.json({ success: true, commentPostCount: updatedReview.commentPostCount })
}