export type FilterExpr =
  | { readonly kind: "eq"; readonly field: string; readonly value: unknown }
  | { readonly kind: "and"; readonly left: FilterExpr; readonly right: FilterExpr }
  | { readonly kind: "not"; readonly inner: FilterExpr };

export interface FilterResult {
  readonly matched: boolean;
}

export function evalSafeFilter(
  expr: FilterExpr,
  record: Readonly<Record<string, unknown>>,
  allowlist: ReadonlySet<string>,
  maxDepth = 8,
  depth = 0,
): boolean {
  if (depth > maxDepth) throw new Error("Filter depth exceeded");
  switch (expr.kind) {
    case "eq":
      if (!allowlist.has(expr.field)) throw new Error(`Field '${expr.field}' not allowlisted`);
      return Object.prototype.hasOwnProperty.call(record, expr.field) && record[expr.field] === expr.value;
    case "and":
      return (
        evalSafeFilter(expr.left, record, allowlist, maxDepth, depth + 1) &&
        evalSafeFilter(expr.right, record, allowlist, maxDepth, depth + 1)
      );
    case "not":
      return !evalSafeFilter(expr.inner, record, allowlist, maxDepth, depth + 1);
  }
}
