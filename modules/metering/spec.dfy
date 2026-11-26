datatype UsageResult = UsageResult(newUsed: int, remaining: int, overage: int)

function ApplyUsage(quota: int, used: int, delta: int): UsageResult
  requires quota >= 0 && used >= 0 && delta >= 0
  ensures ApplyUsage(quota, used, delta).newUsed == used + delta
  ensures ApplyUsage(quota, used, delta).remaining >= 0
  ensures ApplyUsage(quota, used, delta).overage >= 0
  ensures ApplyUsage(quota, used, delta).newUsed -
          ApplyUsage(quota, used, delta).overage +
          ApplyUsage(quota, used, delta).remaining == quota
{
  var next := used + delta;
  var rem := if quota > next then quota - next else 0;
  var over := if next > quota then next - quota else 0;
  UsageResult(next, rem, over)
}
