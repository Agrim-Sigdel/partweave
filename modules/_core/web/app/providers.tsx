"use client";

import type { ComponentType, ReactNode } from "react";
// <partweave:providers-import>

/**
 * Context providers, composed outside-in. Components register their provider
 * at the anchor below; the base scaffold ships with none.
 */
const providers: ComponentType<{ children: ReactNode }>[] = [
  // <partweave:providers>
];

export function Providers({ children }: { children: ReactNode }) {
  return providers.reduceRight(
    (acc, Wrap) => <Wrap>{acc}</Wrap>,
    children as ReactNode,
  );
}
