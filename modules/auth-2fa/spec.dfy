datatype BackupResult = BackupOk(remainingCodes: set<string>) | BackupErr(reason: string)

function ConsumeBackupCode(codes: set<string>, submitted: string): BackupResult
  ensures submitted in codes ==>
    ConsumeBackupCode(codes, submitted).BackupOk? &&
    !(submitted in ConsumeBackupCode(codes, submitted).remainingCodes)
  ensures !(submitted in codes) ==> ConsumeBackupCode(codes, submitted).BackupErr?
{
  if submitted in codes then
    BackupOk(codes - {submitted})
  else
    BackupErr("Invalid backup code")
}
