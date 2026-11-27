"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type MarketLook = "storefront" | "scheduler" | "desk";

export interface LookOption {
  id: MarketLook;
  label: string;
  tagline: string;
}

export const LOOK_OPTIONS: LookOption[] = [
  {
    id: "storefront",
    label: "Storefront",
    tagline: "Visual catalog cards with instant checkout",
  },
  {
    id: "scheduler",
    label: "Scheduler",
    tagline: "Hourly slot timeline & appointment picker",
  },
  {
    id: "desk",
    label: "Ledger Pro",
    tagline: "High-density operational table & state strip",
  },
];

interface LookContextValue {
  look: MarketLook;
  setLook: (next: MarketLook) => void;
}

const LookContext = createContext<LookContextValue | null>(null);
const STORAGE_KEY = "partweave_market_look";

export function LookProvider({ children }: { children: ReactNode }) {
  const [look, setLookState] = useState<MarketLook>("storefront");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as MarketLook | null;
      if (saved && LOOK_OPTIONS.some((o) => o.id === saved)) {
        setLookState(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function setLook(next: MarketLook) {
    setLookState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <LookContext.Provider value={{ look, setLook }}>
      {children}
    </LookContext.Provider>
  );
}

export function useLook(): LookContextValue {
  const ctx = useContext(LookContext);
  if (!ctx) throw new Error("useLook must be used within <LookProvider>");
  return ctx;
}
