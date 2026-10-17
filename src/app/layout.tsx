import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saathi",
  description:
    "A voice-first personal assistant for your files, mail and calendar, powered by Sarvam AI.",
  // The UI is already dark; stops Dark Reader rewriting inline styles, which
  // otherwise shows up as hydration mismatches.
  other: { "darkreader-lock": "true" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
