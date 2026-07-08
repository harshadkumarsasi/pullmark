"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import styles from "./landing.module.css"

const TYPED_TEXT =
  "Took a look at this PR (overall score: 8/10 — security 9, readability 7, performance 8).\n\nOne thing worth fixing: missing input validation on the user ID parameter in api/users.js around line 34. This could allow unexpected values through to the database query.\n\nFound 4 other issues. Full review: https://prreview.dev/review/abc123"

function TypewriterDemo() {
  const [displayed, setDisplayed] = useState("")
  const [bodyOpacity, setBodyOpacity] = useState(1)
  const [isTyping, setIsTyping] = useState(true)
  const indexRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pauseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runTypeInterval = useCallback(() => {
    intervalRef.current = setInterval(() => {
      if (indexRef.current < TYPED_TEXT.length) {
        setDisplayed(TYPED_TEXT.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setIsTyping(false)
      }
    }, 16)
  }, [])

  const resetAndRetype = useCallback(() => {
    // Fade out
    setBodyOpacity(0)
    fadeRef.current = setTimeout(() => {
      indexRef.current = 0
      setDisplayed("")
      setIsTyping(true)
      setBodyOpacity(1)
      runTypeInterval()
    }, 200)
  }, [runTypeInterval])

  useEffect(() => {
    indexRef.current = 0
    setDisplayed("")
    setBodyOpacity(1)
    setIsTyping(true)
    runTypeInterval()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (pauseRef.current) clearTimeout(pauseRef.current)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [runTypeInterval])

  useEffect(() => {
    if (!isTyping) {
      pauseRef.current = setTimeout(() => {
        resetAndRetype()
      }, 3000)
    }
    return () => {
      if (pauseRef.current) clearTimeout(pauseRef.current)
    }
  }, [isTyping, resetAndRetype])

  return (
    <div className={styles.demoCardWrapper}>
      <div className={styles.demoCard}>
        <div className={styles.avatarCircle}>PR</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.commentHeader}>
            <span className={styles.commentUsername}>prreview-bot</span>
            <span className={styles.commentTime}>commented just now</span>
          </div>
          <div className={styles.commentBody} style={{ opacity: bodyOpacity }}>
            {displayed}
            {indexRef.current < TYPED_TEXT.length && <span className={styles.cursor} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function StaggerFadeIn({
  children,
  index,
}: {
  children: React.ReactNode
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), index * 150)
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])

  return (
    <div
      ref={ref}
      className={`${styles.stepCard} ${visible ? styles.stepCardVisible : ""}`}
    >
      {children}
    </div>
  )
}

function FadeInSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}
    >
      {children}
    </div>
  )
}

export default function LandingPage() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className={styles.pageWrapper}>
      {/* Animated background */}
      <div className={styles.bgCanvas} />
      <div className={styles.dotGrid} />
      <div className={styles.content}>
        {/* ─── Nav ─── */}
        <nav className={styles.nav}>
          <span className={styles.navLogo}>PRReview</span>
          <div className={styles.navLinks}>
            <button onClick={() => scrollTo("features")} className={styles.navLink}>
              Features
            </button>
            <button onClick={() => scrollTo("how-it-works")} className={styles.navLink}>
              How it works
            </button>
          </div>
          <Link href="/login" className={styles.navSignIn}>
            Sign in
          </Link>
        </nav>

        {/* ─── Hero ─── */}
        <section className={styles.heroSection}>
          <div className={styles.hero}>
            <div className={styles.heroBlob1} />
            <div className={styles.heroBlob2} />
            <div className={styles.heroContent}>
              <div className={styles.eyebrow} style={{ animationDelay: "0ms" }}>
                <span className={styles.pulsingDot} />
                Now in beta
              </div>
              <h1 className={styles.headline}>
                <span style={{ display: "block", animationDelay: "100ms" }} className={styles.heroAnimated}>
                  Your PR reviewed.
                </span>
                <span style={{ display: "block", animationDelay: "200ms" }} className={styles.heroAnimated}>
                  Posted to GitHub
                </span>
                <span style={{ display: "block", animationDelay: "300ms" }} className={styles.heroAnimated}>
                  automatically.
                </span>
              </h1>
              <p className={`${styles.subheading} ${styles.heroAnimated}`} style={{ animationDelay: "400ms" }}>
                Drop any GitHub PR URL. Get a structured AI review across security, readability, and performance — then post it as a comment right on the PR. Takes under 10 seconds.
              </p>
              <Link href="/login" className={`${styles.ctaButton} ${styles.heroAnimated}`} style={{ animationDelay: "500ms" }}>
                Start reviewing free
              </Link>
              <div className={styles.demoCardContainer}>
                <TypewriterDemo />
              </div>
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className={`${styles.section} ${styles.howItWorksBg}`}>
          <div className={styles.sectionInner}>
            <FadeInSection>
              <div className={styles.sectionLabel}>How it works</div>
              <h2 className={styles.sectionTitle}>Three simple steps</h2>
            </FadeInSection>
            <div className={styles.stepsGrid}>
              <StaggerFadeIn index={0}>
                <div className={styles.stepIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <h3 className={styles.stepTitle}>Paste a PR URL</h3>
                <p className={styles.stepDesc}>
                  Any public or private GitHub PR — just paste the link and we'll fetch the diff.
                </p>
              </StaggerFadeIn>
              <StaggerFadeIn index={1}>
                <div className={styles.stepIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <h3 className={styles.stepTitle}>AI reviews the diff</h3>
                <p className={styles.stepDesc}>
                  Security, readability, and performance scored per file with actionable findings.
                </p>
              </StaggerFadeIn>
              <StaggerFadeIn index={2}>
                <div className={styles.stepIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className={styles.stepTitle}>Comment posted</h3>
                <p className={styles.stepDesc}>
                  Summary appears on the PR automatically — your team sees it right where the code lives.
                </p>
              </StaggerFadeIn>
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className={styles.section}>
          <div className={styles.sectionInner}>
            <FadeInSection>
              <div className={styles.sectionLabel}>Features</div>
              <h2 className={styles.sectionTitle}>Everything you need</h2>
              <div className={styles.featuresGrid}>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h3 className={styles.featureTitle}>Security scoring</h3>
                  <p className={styles.featureDesc}>
                    Flags injection risks, exposed secrets, and unsafe patterns before they reach production.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <h3 className={styles.featureTitle}>Private repo support</h3>
                  <p className={styles.featureDesc}>
                    Connect GitHub OAuth to review private PRs with the same depth and speed.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </div>
                  <h3 className={styles.featureTitle}>Shareable reports</h3>
                  <p className={styles.featureDesc}>
                    Every review gets a public link for your team — no login required to view.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F7FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className={styles.featureTitle}>GitHub comment bot</h3>
                  <p className={styles.featureDesc}>
                    Post the review summary directly to the PR as a comment — no extra tools needed.
                  </p>
                </div>
              </div>
            </FadeInSection>
          </div>
        </section>

        {/* ─── Live Example ─── */}
        <section className={styles.section}>
          <div className={styles.sectionInner}>
            <FadeInSection>
              <div className={styles.sectionLabel}>Live example</div>
              <h2 className={styles.sectionTitle}>See a review in action</h2>
              <div className={styles.exampleCard}>
                <div className={styles.exampleTopBar}>
                  <div className={styles.dotGroup}>
                    <div className={`${styles.dot} ${styles.dotRed}`} />
                    <div className={`${styles.dot} ${styles.dotYellow}`} />
                    <div className={`${styles.dot} ${styles.dotGreen}`} />
                  </div>
                  <span className={styles.exampleTopBarTitle}>
                    PRReview — AI Code Review
                  </span>
                </div>
                <div className={styles.exampleBody}>
                  <div className={styles.scoresGrid}>
                    <div className={styles.scoreCard}>
                      <div className={styles.scoreLabel}>Security</div>
                      <div className={`${styles.scoreValue} ${styles.scoreValueGreen}`}>9</div>
                    </div>
                    <div className={styles.scoreCard}>
                      <div className={styles.scoreLabel}>Readability</div>
                      <div className={`${styles.scoreValue} ${styles.scoreValueAmber}`}>7</div>
                    </div>
                    <div className={styles.scoreCard}>
                      <div className={styles.scoreLabel}>Performance</div>
                      <div className={`${styles.scoreValue} ${styles.scoreValueBlue}`}>8</div>
                    </div>
                    <div className={styles.scoreCard}>
                      <div className={styles.scoreLabel}>Overall</div>
                      <div className={`${styles.scoreValue} ${styles.scoreValueGreen}`}>8</div>
                    </div>
                  </div>
                  <div className={styles.issuePills}>
                    <span className={styles.issuePill}>Critical 0</span>
                    <span className={`${styles.issuePill} ${styles.issuePillAmber}`}>Warning 1</span>
                    <span className={`${styles.issuePill} ${styles.issuePillBlue}`}>Info 2</span>
                  </div>
                  <div className={styles.fileResults}>
                    <div className={styles.fileResult}>
                      <span className={styles.fileChevron}>▾</span>
                      <span className={styles.filePath}>api/users.js</span>
                      <span className={`${styles.fileIssueCount} ${styles.fileIssueCountWarn}`}>1 issue</span>
                    </div>
                    <div className={styles.fileResult}>
                      <span className={styles.fileChevron}>▸</span>
                      <span className={styles.filePath}>middleware/auth.js</span>
                      <span className={styles.fileIssueCount}>0 issues</span>
                    </div>
                  </div>
                </div>
                <div className={styles.exampleCaption}>
                  Actual output from PRReview — reviewed in 4.2s
                </div>
              </div>
            </FadeInSection>
          </div>
        </section>


        {/* ─── Footer ─── */}
        <footer className={styles.footer}>
          <span className={styles.footerLeft}>PRReview</span>
          <span className={styles.footerRight}>
            Built by{" "}
            <a href="https://github.com/harshadkumarsasi" target="_blank" rel="noopener noreferrer">
              Harshad
            </a>
          </span>
        </footer>
      </div>
    </div>
  )
}