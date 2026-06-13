import { auth } from "@/auth"
import { buildReviewComment } from "@/lib/buildReviewComment"

export async function GET(
  _request: Request,
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

  try {
    const comment = await buildReviewComment(id)
    return Response.json({ comment })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to generate comment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}