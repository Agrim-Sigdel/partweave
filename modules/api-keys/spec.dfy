datatype ApiKeyRecord = ApiKeyRecord(
  keyPrefix: string,
  revoked: bool,
  expiresAtEpoch: int,
  scopes: set<string>
)

datatype ApiKeyDecision = ApiKeyDecision(allowed: bool, statusCode: int, reason: string)

function ValidateApiKey(
  rec: ApiKeyRecord,
  expectedPrefix: string,
  nowEpoch: int,
  requiredScope: string
): ApiKeyDecision
  ensures rec.revoked ==> !ValidateApiKey(rec, expectedPrefix, nowEpoch, requiredScope).allowed
  ensures rec.expiresAtEpoch <= nowEpoch ==>
    !ValidateApiKey(rec, expectedPrefix, nowEpoch, requiredScope).allowed
{
  if rec.keyPrefix != expectedPrefix then
    ApiKeyDecision(false, 401, "Invalid API key prefix")
  else if rec.revoked then
    ApiKeyDecision(false, 401, "API key revoked")
  else if rec.expiresAtEpoch <= nowEpoch then
    ApiKeyDecision(false, 401, "API key expired")
  else if !(requiredScope in rec.scopes) then
    ApiKeyDecision(false, 403, "Missing API key scope '" + requiredScope + "'")
  else
    ApiKeyDecision(true, 200, "granted")
}
