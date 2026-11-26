datatype SubStatus = Trialing | Active | PastDue | Canceled

datatype SubDecision = SubOk(nextStatus: SubStatus) | SubErr(reason: string)

function DecideSubTransition(cur: SubStatus, ev: string): SubDecision
  ensures cur == Canceled ==> DecideSubTransition(cur, ev).SubErr?
{
  if cur == Canceled then
    SubErr("Canceled subscription cannot transition")
  else if cur == Trialing && ev == "activate" then SubOk(Active)
  else if cur == Trialing && ev == "cancel" then SubOk(Canceled)
  else if cur == Active && ev == "payment_failed" then SubOk(PastDue)
  else if cur == Active && ev == "cancel" then SubOk(Canceled)
  else if cur == PastDue && ev == "payment_succeeded" then SubOk(Active)
  else if cur == PastDue && ev == "cancel" then SubOk(Canceled)
  else SubErr("Illegal subscription transition")
}

function ProrateCents(priceCents: int, remainingDays: int, totalDays: int): int
  requires priceCents >= 0 && 0 <= remainingDays <= totalDays && totalDays >= 1
  ensures 0 <= ProrateCents(priceCents, remainingDays, totalDays) <= priceCents
{
  (priceCents * remainingDays) / totalDays
}
