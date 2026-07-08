import type { Metadata } from "next";
import { Syne, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Pullmark — AI Code Review for GitHub Pull Requests",
  description: "Paste a pull request URL. Get a structured review across security, readability, and performance — posted as a comment right on the PR.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className={`${syne.variable} ${inter.variable} ${jetbrainsMono.variable} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}
