import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADIOS — Adaptive Dump Intelligence & Orchestration System",
  description: "Enterprise-grade mining dump intelligence platform with constraint-aware dispatch, truthful ML policy metadata, and real-time 3D terrain visualization.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
