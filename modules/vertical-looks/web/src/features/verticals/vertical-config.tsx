"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLook, type MarketLook } from "@/features/looks/look-context";

export type VerticalId = "escrow" | "barber" | "florist" | "saas";

export interface VerticalConfig {
  id: VerticalId;
  brandName: string;
  badgeText: string;
  heroTitle: string;
  heroSubtitle: string;
  defaultLook: MarketLook;
  listingsTitle: string;
  listingsSubtitle: string;
  bookingsTitle: string;
  bookingsSubtitle: string;
  itemNoun: string;
  itemPlural: string;
  slotUnitLabel: string;
  reserveLabel: string;
  publishLabel: string;
  categories: string[];
  accentBadgeClass: string;
}

export const VERTICAL_PRESETS: Record<VerticalId, VerticalConfig> = {
  escrow: {
    id: "escrow",
    brandName: "{{projectName}}",
    badgeText: "Escrow Marketplace",
    heroTitle: "Book Services with Protected Escrow & Slot Locks",
    heroSubtitle:
      "Publish service listings, lock non-overlapping time slots, hold funds in a zero-sum ledger, and resolve disputes by quorum.",
    defaultLook: "storefront",
    listingsTitle: "Service Marketplace Listings",
    listingsSubtitle:
      "Verified integer-cent pricing, non-overlapping slot locks, and atomic escrow holds.",
    bookingsTitle: "Bookings & Escrow Workflow",
    bookingsSubtitle:
      "Every booking transition is verified by the state machine and logged in audit_log.",
    itemNoun: "Service",
    itemPlural: "Services",
    slotUnitLabel: "slots",
    reserveLabel: "Reserve Slot Atomically",
    publishLabel: "Publish Service Listing",
    categories: ["consulting", "design", "security", "engineering"],
    accentBadgeClass: "bg-emerald-600",
  },
  barber: {
    id: "barber",
    brandName: "Crown & Blade",
    badgeText: "Barbershop Booking",
    heroTitle: "Precision Cuts, Zero Double-Bookings",
    heroSubtitle:
      "Pick your barber service, claim an exact chair time slot, and hold your deposit until the cut is complete.",
    defaultLook: "scheduler",
    listingsTitle: "Cuts, Shaves & Grooming Menu",
    listingsSubtitle:
      "Select a service and tap any open chair time window to lock your appointment.",
    bookingsTitle: "Appointments & Chair Schedule",
    bookingsSubtitle:
      "Track upcoming chair bookings from reserved deposit through checkout release.",
    itemNoun: "Appointment",
    itemPlural: "Services",
    slotUnitLabel: "chairs",
    reserveLabel: "Book Appointment",
    publishLabel: "Add Grooming Service",
    categories: ["haircut", "beard", "package", "styling"],
    accentBadgeClass: "bg-amber-600",
  },
  florist: {
    id: "florist",
    brandName: "Bloom & Petal",
    badgeText: "Floral Storefront",
    heroTitle: "Hand-Tied Bouquets Delivered Fresh",
    heroSubtitle:
      "Browse seasonal arrangements, pick a delivery window, and keep payment protected in escrow until delivery.",
    defaultLook: "storefront",
    listingsTitle: "Seasonal Bouquets & Arrangements",
    listingsSubtitle:
      "Live stem stock counts, instant bundle discounts, and scheduled delivery windows.",
    bookingsTitle: "Flower Orders & Deliveries",
    bookingsSubtitle:
      "Monitor bouquet orders from reservation and escrow lock to doorstep delivery.",
    itemNoun: "Bouquet",
    itemPlural: "Bouquets",
    slotUnitLabel: "bouquets",
    reserveLabel: "Order Bouquet Delivery",
    publishLabel: "Add Floral Arrangement",
    categories: ["bouquets", "roses", "orchids", "events"],
    accentBadgeClass: "bg-rose-600",
  },
  saas: {
    id: "saas",
    brandName: "Apex Cloud",
    badgeText: "B2B SaaS Plans",
    heroTitle: "Provision Workspaces & Metering Quotas",
    heroSubtitle:
      "Compare plan tiers, calculate volume discounts, and manage tenant commitments in an auditable ledger.",
    defaultLook: "desk",
    listingsTitle: "Plans, Seats & Usage Add-ons",
    listingsSubtitle:
      "Transparent integer-cent tier pricing, volume discounts, and auditable workspace provisioning.",
    bookingsTitle: "Active Subscriptions & Commitments",
    bookingsSubtitle:
      "Review provisioned commitments, escrow retainers, and lifecycle state transitions.",
    itemNoun: "Plan",
    itemPlural: "Plans",
    slotUnitLabel: "seats",
    reserveLabel: "Provision Plan",
    publishLabel: "Add SaaS Plan",
    categories: ["starter", "pro", "enterprise", "addon"],
    accentBadgeClass: "bg-blue-600",
  },
};

export const VERTICAL_LIST: VerticalConfig[] = Object.values(VERTICAL_PRESETS);

interface VerticalContextValue {
  vertical: VerticalConfig;
  setVertical: (id: VerticalId) => void;
}

const VerticalContext = createContext<VerticalContextValue | null>(null);
const STORAGE_KEY = "partweave_vertical";

export function VerticalProvider({ children }: { children: ReactNode }) {
  const { setLook } = useLook();
  const defaultFromEnv = (process.env.NEXT_PUBLIC_DEFAULT_VERTICAL as VerticalId | undefined) || "escrow";
  const initialId: VerticalId = defaultFromEnv in VERTICAL_PRESETS ? defaultFromEnv : "escrow";
  const [verticalId, setVerticalId] = useState<VerticalId>(initialId);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as VerticalId | null;
      if (saved && saved in VERTICAL_PRESETS) {
        setVerticalId(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function setVertical(id: VerticalId) {
    setVerticalId(id);
    setLook(VERTICAL_PRESETS[id].defaultLook);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }

  return (
    <VerticalContext.Provider
      value={{ vertical: VERTICAL_PRESETS[verticalId], setVertical }}
    >
      {children}
    </VerticalContext.Provider>
  );
}

export function useVertical(): VerticalContextValue {
  const ctx = useContext(VerticalContext);
  if (!ctx) throw new Error("useVertical must be used within <VerticalProvider>");
  return ctx;
}
