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
          {loading ? "Posting…" : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: '6px', flexShrink: 0, verticalAlign: 'middle'}}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Post to GitHub PR
            </>
          )}
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