import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matcap Studio — Viewport Materials",
  description: "Create, inspect, and export matcap materials locally for Viewpoint.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
