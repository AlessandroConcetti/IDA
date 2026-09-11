param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$idaSecretPointer = [IntPtr]::Zero
try {
  Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1" -ErrorAction Stop
  $idaProtectedFile = Get-Item -LiteralPath $Path
  if ($idaProtectedFile.PSIsContainer -or $idaProtectedFile.Length -gt 32768 -or ($idaProtectedFile.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid file' }
  $idaSecureToken = ConvertTo-SecureString ([IO.File]::ReadAllText($idaProtectedFile.FullName))
  $idaSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($idaSecureToken)
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($idaSecretPointer))
} catch { [Console]::Error.Write('HOME_SECRET_UNAVAILABLE'); exit 1 }
finally {
  if ($idaSecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($idaSecretPointer) }
  if ($idaSecureToken) { $idaSecureToken.Dispose() }
}
