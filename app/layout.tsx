import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wealth at Your Fingertips",
  description: "Intent-first wealth orchestration platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
