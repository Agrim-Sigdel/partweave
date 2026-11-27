import { PartweaveError } from "./errors.js";
import type { AppName } from "./types.js";

export interface VerticalPresetSpec {
  id: string;
  description: string;
  apps: AppName[];
  modules: string[];
  defaultVertical: "barber" | "florist" | "escrow" | "saas";
}

export const PRESETS: Record<string, VerticalPresetSpec> = {
  barbershop: {
    id: "barbershop",
    description: "Barbershop appointment booking with slot locks, pricing, and multi-look UI",
    apps: ["server", "web"],
    modules: [
      "auth",
      "db-postgres",
      "pricing",
      "reservations",
      "workflow-engine",
      "audit-log",
      "ui-kit",
      "vertical-looks",
    ],
    defaultVertical: "barber",
  },
  florist: {
    id: "florist",
    description: "Flower shop storefront with bouquet inventory, delivery windows, and escrow",
    apps: ["server", "web"],
    modules: [
      "auth",
      "db-postgres",
      "pricing",
      "reservations",
      "workflow-engine",
      "ledger",
      "ui-kit",
      "vertical-looks",
    ],
    defaultVertical: "florist",
  },
  "escrow-market": {
    id: "escrow-market",
    description: "Full two-sided escrow marketplace with quorum disputes and verified cores",
    apps: ["server", "web"],
    modules: [
      "auth",
      "db-postgres",
      "pricing",
      "reservations",
      "workflow-engine",
      "ledger",
      "quorum",
      "rbac",
      "multi-tenancy",
      "audit-log",
      "filter-eval",
      "pagination",
      "rate-limit",
      "ui-kit",
      "vertical-looks",
    ],
    defaultVertical: "escrow",
  },
  saas: {
    id: "saas",
    description: "Multi-tenant B2B SaaS with subscriptions, metering, RBAC, and API keys",
    apps: ["server", "web"],
    modules: [
      "auth",
      "db-postgres",
      "subscriptions",
      "metering",
      "rbac",
      "multi-tenancy",
      "api-keys",
      "audit-log",
      "rate-limit",
      "ui-kit",
      "vertical-looks",
    ],
    defaultVertical: "saas",
  },
};

export function resolvePreset(id: string): VerticalPresetSpec {
  const key = id.trim().toLowerCase();
  const preset = PRESETS[key];
  if (!preset) {
    throw new PartweaveError(
      "usage",
      `Unknown preset "${id}". Choose one of: ${Object.keys(PRESETS).join(", ")}.`,
      { preset: id, available: Object.keys(PRESETS) },
    );
  }
  return preset;
}
