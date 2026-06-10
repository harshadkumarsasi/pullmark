export default function SignInButton() {
  return (
    <a
      href="/login"
      style={{
        display: "inline-block",
        padding: "8px 16px",
        border: "1px solid #333",
        borderRadius: "6px",
        color: "#fff",
        textDecoration: "none",
        fontSize: "14px",
      }}
    >
      Sign in to review your own PRs
    </a>
  )
}
