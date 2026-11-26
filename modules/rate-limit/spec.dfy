datatype BucketDecision = BucketDecision(allowed: bool, remaining: int, retryAfterSec: int)

function ConsumeTokens(
  tokens: int,
  capacity: int,
  elapsedSec: int,
  refillPerSec: int,
  cost: int
): BucketDecision
  requires tokens >= 0 && capacity >= 1 && elapsedSec >= 0 && refillPerSec >= 1 && cost >= 1
  ensures 0 <= ConsumeTokens(tokens, capacity, elapsedSec, refillPerSec, cost).remaining <= capacity
  ensures ConsumeTokens(tokens, capacity, elapsedSec, refillPerSec, cost).retryAfterSec >= 0
{
  var refilled := if tokens + elapsedSec * refillPerSec > capacity
                  then capacity else tokens + elapsedSec * refillPerSec;
  if refilled >= cost then
    BucketDecision(true, refilled - cost, 0)
  else
    var deficit := cost - refilled;
    BucketDecision(false, refilled, (deficit + refillPerSec - 1) / refillPerSec)
}
