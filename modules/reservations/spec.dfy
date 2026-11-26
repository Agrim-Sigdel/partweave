predicate Overlaps(s1: int, e1: int, s2: int, e2: int)
  requires s1 < e1 && s2 < e2
{
  s1 < e2 && s2 < e1
}

datatype StockResult = StockOk(available: int, reserved: int) | StockErr(reason: string)

function ReserveStock(available: int, reserved: int, qty: int): StockResult
  requires available >= 0 && reserved >= 0 && qty >= 1
  ensures ReserveStock(available, reserved, qty).StockOk? ==>
    ReserveStock(available, reserved, qty).available +
    ReserveStock(available, reserved, qty).reserved == available + reserved
{
  if available >= qty then
    StockOk(available - qty, reserved + qty)
  else
    StockErr("Insufficient stock")
}
