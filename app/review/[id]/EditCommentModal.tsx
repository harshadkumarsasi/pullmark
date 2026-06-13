"use client"

import { useState, useRef, useEffect } from "react"

type Props = {
  reviewId: string
  initialComment: string
  isOpen: boolean
  onClose: () => void
  onPosted: (commentPostCount: number) => void
}

export default function EditCommentModal({
  reviewId,
  initialComment,
  isOpen,
  onClose,
  onPosted,
}: Props) {
  const [comment, setComment] = useState(initialComment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Small delay so the DOM is rendered before triggering the transition
      requestAnimationFrame(() => setVisible(true))
      setComment(initialComment)
      setError(null)
      setLoading(false)
    } else {
      setVisible(false)
    }
  }, [isOpen, initialComment])

  useEffect(() => {
    if (visible && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [visible])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handlePublish = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/review/${reviewId}/post-comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to post comment")
      }

      const data = await res.json()
      onPosted(data.commentPostCount)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: visible ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0)",
        transition: "background-color 200ms ease",
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "640px",
          backgroundColor: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "24px",
          transform: visible ? "translateY(0)" : "translateY(20px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#fff",
            margin: "0 0 16px",
          }}
        >
          Edit comment before posting
        </h2>

        <textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={12}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px",
            fontSize: "13px",
            fontFamily: "var(--font-geist-mono, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace)",
            color: "#e4e4e7",
            backgroundColor: "#111111",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            resize: "vertical",
            outline: "none",
            lineHeight: "1.6",
          }}
        />

        {error && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "13px",
              color: "#f87171",
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              color: "#a1a1aa",
              background: "transparent",
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={loading}
            style={{
              padding: "8px 16px",
              border: "1px solid #3b82f6",
              borderRadius: "6px",
              color: "#fff",
              background: loading ? "#1e3a5f" : "#2563eb",
              fontSize: "14px",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {loading ? "Posting…" : "Publish to GitHub"}
          </button>
        </div>
      </div>
    </div>
  )
}