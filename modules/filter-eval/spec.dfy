datatype FilterNode =
  | Eq(field: string, value: string)
  | And(left: FilterNode, right: FilterNode)
  | Not(inner: FilterNode)

predicate AllowedFields(node: FilterNode, allowlist: set<string>)
{
  match node
  case Eq(f, _) => f in allowlist
  case And(l, r) => AllowedFields(l, allowlist) && AllowedFields(r, allowlist)
  case Not(inner) => AllowedFields(inner, allowlist)
}

function EvalFilter(node: FilterNode, record: map<string, string>, allowlist: set<string>): bool
  requires AllowedFields(node, allowlist)
{
  match node
  case Eq(f, v) => f in record && record[f] == v
  case And(l, r) => EvalFilter(l, record, allowlist) && EvalFilter(r, record, allowlist)
  case Not(inner) => !EvalFilter(inner, record, allowlist)
}
