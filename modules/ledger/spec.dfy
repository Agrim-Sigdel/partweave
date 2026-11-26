function SumAmounts(xs: seq<int>): int
{
  if |xs| == 0 then 0 else xs[0] + SumAmounts(xs[1..])
}

predicate IsBalanced(xs: seq<int>)
{
  |xs| > 0 && SumAmounts(xs) == 0
}
