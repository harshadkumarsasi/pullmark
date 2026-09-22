import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { buildReviewComment } from "@/lib/buildReviewComment"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let userId: string | undefined
  let githubAccountFound = false
  let githubAccessTokenFound = false
  let reviewLoaded = false

  try {
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
  userId = user?.id

  const githubAccount = user?.accounts?.find((a) => a.provider === "github")
  githubAccountFound = Boolean(githubAccount)
  githubAccessTokenFound = Boolean(githubAccount?.access_token)
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
  reviewLoaded = true

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

  console.log("GitHub account selected for comment:", {
    provider: githubAccount?.provider ?? null,
    hasAccessToken: githubAccessTokenFound,
  })

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
    const errorData = await response.json().catch(() => ({}))
    const githubMessage =
      typeof errorData.message === "string" ? errorData.message : ""
    const failureMessage =
      response.status === 422 && githubMessage.toLowerCase().includes("locked")
        ? "This PR's conversation is locked and only accepts comments from collaborators."
        : response.status === 403
          ? "You do not have permission to comment on this PR."
          : "Failed to post comment"

    await prisma.review.update({
      where: { id },
      data: { lastPostError: failureMessage },
    })

    if (response.status === 422 && githubMessage.toLowerCase().includes("locked")) {
      return new Response(
        JSON.stringify({
          error: "LOCKED_CONVERSATION",
          message: "This PR's conversation is locked and only accepts comments from collaborators.",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      )
    }

    if (response.status === 403) {
      return new Response(
        JSON.stringify({
          error: "PERMISSION_DENIED",
          message: "You do not have permission to comment on this PR.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify({ error: "Failed to post comment" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const updatedReview = await prisma.review.update({
    where: { id },
    data: { commentPostCount: { increment: 1 }, lastPostError: null },
  })

  return Response.json({ success: true, commentPostCount: updatedReview.commentPostCount })
  } catch (error: unknown) {
    if (reviewLoaded) {
      await prisma.review.update({
        where: { id },
        data: { lastPostError: error instanceof Error ? error.message : String(error) },
      })
    }

    const errorRecord = error as { message?: unknown; status?: unknown }
    console.error("Failed to post GitHub comment:", {
      message: error instanceof Error ? error.message : String(error),
      status: errorRecord.status,
      userId,
      reviewId: id,
      githubAccountFound,
      githubAccessTokenFound,
    })
    return new Response(JSON.stringify({ error: "Failed to post comment" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}