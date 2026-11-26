datatype PageWindow = PageWindow(start: int, endExclusive: int, hasMore: bool)

function ClampLimit(requested: int, maxLimit: int): int
  requires maxLimit >= 1
  ensures 1 <= ClampLimit(requested, maxLimit) <= maxLimit
{
  if requested < 1 then 1
  else if requested > maxLimit then maxLimit
  else requested
}

function BuildPageWindow(offset: int, limit: int, total: int): PageWindow
  requires offset >= 0 && limit >= 1 && total >= 0
  ensures 0 <= BuildPageWindow(offset, limit, total).start
  ensures BuildPageWindow(offset, limit, total).start <= BuildPageWindow(offset, limit, total).endExclusive
  ensures BuildPageWindow(offset, limit, total).endExclusive <= total
{
  var start := if offset > total then total else offset;
  var endEx := if start + limit > total then total else start + limit;
  PageWindow(start, endEx, endEx < total)
}
