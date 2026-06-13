"use client"

import { useState, useCallback } from "react"
import EditCommentModal from "./EditCommentModal"

export default function PostToGitHubButton({
  reviewId,
  initialPostCount = 0,
}: {
  reviewId: string
  initialPostCount?: number
}) {
  const [loading, setLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [postCount, setPostCount] = useState(initialPostCount)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingComment, setPendingComment] = useState("")

  const handlePost = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/review/${reviewId}/post-comment`, {
        method: "POST",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to post comment")
      }

      const data = await res.json()
      setPostCount(data.commentPostCount)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment")
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = async () => {
    setEditLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/review/${reviewId}/comment-preview`)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to get comment preview")
      }

      const data = await res.json()
      setPendingComment(data.comment)
      setModalOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comment preview")
    } finally {
      setEditLoading(false)
    }
  }

  const handleModalClose = useCallback(() => {
    setModalOpen(false)
  }, [])

  const handlePosted = useCallback((commentPostCount: number) => {
    setPostCount(commentPostCount)
  }, [])

  const btnStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "8px 16px",
    border: "1px solid #333",
    borderRadius: "6px",
    color: "#fff",
    textDecoration: "none",
    fontSize: "14px",
    cursor: loading ? "default" : "pointer",
    opacity: loading ? 0.7 : 1,
    background: "transparent",
    fontFamily: "inherit",
    lineHeight: "inherit",
  }

  const editBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "6px",
    color: "#a1a1aa",
    fontSize: "13px",
    cursor: editLoading ? "default" : "pointer",
    opacity: editLoading ? 0.7 : 1,
    background: "transparent",
    fontFamily: "inherit",
    lineHeight: "inherit",
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          type="button"
          style={btnStyle}
          onClick={handlePost}
          disabled={loading}
        >
          {loading ? "Posting…" : "Post to GitHub PR"}
        </button>
        <button
          type="button"
          style={editBtnStyle}
          onClick={handleEditClick}
          disabled={editLoading}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {editLoading ? "Loading…" : "Edit before posting"}
        </button>
        {postCount > 0 && (
          <span style={{ fontSize: "13px", color: "#a1a1aa" }}>
            Posted to GitHub ({postCount}x)
          </span>
        )}
      </div>
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#f87171" }}>
          {error}
        </p>
      )}
      {modalOpen && (
        <EditCommentModal
          reviewId={reviewId}
          initialComment={pendingComment}
          isOpen={modalOpen}
          onClose={handleModalClose}
          onPosted={handlePosted}
        />
      )}
    </>
  )
}