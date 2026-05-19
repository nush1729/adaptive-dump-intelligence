"use client";
import React from "react";

export function RailItem({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="adios-rail-item" title={`${label}: ${value}`}>
      <span>{label}</span>
      <strong className={accent ? "text-[#FFC000]" : ""}>{value}</strong>
    </div>
  );
}
