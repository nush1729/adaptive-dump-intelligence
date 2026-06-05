const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchHealth() {
  const r = await fetch(`${BASE}/health`);
  return r.json();
}

export async function fetchFleetSpecs() {
  const r = await fetch(`${BASE}/fleet_specs`);
  return r.json();
}

export async function runSimulation(cfg: object) {
  const r = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export async function tuneWeights(cfg: object) {
  const r = await fetch(`${BASE}/tune`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return r.json();
}

export async function fetchBenchmark() {
  const r = await fetch(`${BASE}/benchmark`);
  return r.json();
}

export async function fetchAudit() {
  const r = await fetch(`${BASE}/audit`);
  return r.json();
}

export async function fetchEvalResult() {
  const r = await fetch(`${BASE}/eval_result`);
  return r.json();
}

export async function fetchSpacingAnalysis(seed: number, material: string, dumpPositions: [number, number][]) {
  const r = await fetch(`${BASE}/spacing_analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed, material, dump_positions: dumpPositions }),
  });
  return r.json();
}

export async function fetchFleetIntelligence(seed?: number, nTrucks?: number) {
  const params = new URLSearchParams();
  if (seed !== undefined) params.set("seed", String(seed));
  if (nTrucks !== undefined) params.set("n_trucks", String(nTrucks));
  const r = await fetch(`${BASE}/fleet_intelligence?${params}`);
  return r.json();
}

export function createWebSocket(cfg: object, onMessage: (msg: any) => void, onDone?: () => void) {
  const wsBase = BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/simulate`);
  ws.onopen = () => {
    ws.send(JSON.stringify(cfg));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    onMessage(msg);
    if (msg.type === "done" && onDone) onDone();
  };
  return ws;
}
