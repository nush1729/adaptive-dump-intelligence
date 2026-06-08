"use client";
import { useEffect } from "react";
import { useSimStore } from "@/store/simStore";

const LEVEL_STYLE: Record<string, { border: string; text: string; glyph: string }> = {
  info:  { border: "var(--cyan)",  text: "var(--cyan)",  glyph: "ⓘ" },
  warn:  { border: "var(--amber)", text: "var(--amber)", glyph: "⚠" },
  error: { border: "#FF5722",      text: "#FF5722",      glyph: "✕" },
};

const AUTO_DISMISS_MS = 6000;

export default function Toaster() {
  const toasts = useSimStore((s) => s.toasts);
  const dismissToast = useSimStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismissToast(t.id), AUTO_DISMISS_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-16 right-4 z-50 flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const style = LEVEL_STYLE[t.level] ?? LEVEL_STYLE.info;
        return (
          <div
            key={t.id}
            role="alert"
            onClick={() => dismissToast(t.id)}
            className="font-mono text-[0.72rem] rounded border px-3 py-2 cursor-pointer shadow-lg backdrop-blur-sm transition-opacity"
            style={{
              borderColor: style.border,
              background: "color-mix(in srgb, var(--panel) 88%, transparent)",
              color: "var(--text)",
            }}
            title="Click to dismiss"
          >
            <div className="flex items-center gap-1.5 uppercase tracking-[0.1em]" style={{ color: style.text }}>
              <span>{style.glyph}</span>
              <span>{t.title}</span>
            </div>
            {t.detail && (
              <div className="mt-0.5 opacity-80 normal-case tracking-normal">{t.detail}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
