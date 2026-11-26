function RedactEntry(key: string, val: string, sensitive: set<string>): string
  ensures key in sensitive ==> RedactEntry(key, val, sensitive) == "[REDACTED]"
  ensures !(key in sensitive) ==> RedactEntry(key, val, sensitive) == val
{
  if key in sensitive then "[REDACTED]" else val
}

function ComputeChangedKeys(before: map<string, string>, after: map<string, string>): set<string>
  ensures forall k :: k in ComputeChangedKeys(before, after) ==>
    !(k in before) || !(k in after) || before[k] != after[k]
{
  (set k | k in before && (!(k in after) || before[k] != after[k])) +
  (set k | k in after && !(k in before))
}
