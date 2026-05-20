"use client";
import React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}

export default function IconButton({ label, active = false, children, className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`adios-icon-button ${active ? "is-active" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
