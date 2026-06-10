import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  return new Response(JSON.stringify(review), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
