import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedSafe",
  description:
    "Educational tool that checks a medication list for drug–drug interactions. Not medical advice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
