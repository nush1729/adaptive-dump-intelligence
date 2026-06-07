export const UI_DEFAULTS = {
  isoThreshold: 0.88,
  minDumpSpacing: 2.0,
  seed: 42,
  nDumps: 60,
  fleet: ["Cat793", "Cat777", "Cat797", "Cat793"],
} as const;

// Stock payload tonnages — mirrors backend fleet/truck.py CAT_SPECS, used as
// placeholder text in the override inputs so users see the baseline they're changing.
export const STOCK_PAYLOADS_T: Record<string, number> = {
  Cat793: 218,
  Cat777: 104,
  Cat797: 400,
};
