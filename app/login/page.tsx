"use client"

import { signIn } from "next-auth/react"

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111111] p-8 shadow-xl shadow-black/20">
        <div className="space-y-4 text-center">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Sign in to continue</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Use one of the providers below to sign in and review PRs faster.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => signIn("github")}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/15"
            >
              Sign in with GitHub
            </button>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => signIn("google")}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/15"
              >
                Sign in with Google
              </button>
              <button
                type="button"
                onClick={() => signIn("google", {}, { prompt: "select_account" })}
                className="text-xs text-zinc-400 underline-offset-4 transition hover:text-white"
              >
                Use a different Google account
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
