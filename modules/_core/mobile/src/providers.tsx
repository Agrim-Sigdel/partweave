import type { ComponentType, ReactNode } from "react";
// <quick-build:providers-import>

/**
 * Context providers, composed outside-in. Components register their provider
 * at the anchor below; the base scaffold ships with none.
 */
const providers: ComponentType<{ children: ReactNode }>[] = [
  // <quick-build:providers>
];

export function Providers({ children }: { children: ReactNode }) {
  return providers.reduceRight(
    (acc, Wrap) => <Wrap>{acc}</Wrap>,
    children as ReactNode,
  );
}
