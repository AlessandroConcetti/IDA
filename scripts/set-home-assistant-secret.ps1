param([Parameter(Mandatory = $true)][ValidatePattern('^wsp_[a-zA-Z0-9_]+$')][string]$WorkspaceId)
$ErrorActionPreference = 'Stop'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1" -ErrorAction Stop
# À lancer volontairement dans son terminal Windows, jamais par le frontend/LLM.
$idaVaultRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.data/connector-secrets'))
$idaSecretFile = Join-Path $idaVaultRoot ($WorkspaceId + '.home-assistant.dpapi')
if (Test-Path -LiteralPath $idaSecretFile) { throw 'Un secret existe déjà. Révoquez-le dans Home Assistant et retirez explicitement son fichier avant remplacement.' }
$null = New-Item -ItemType Directory -Path $idaVaultRoot -Force
$idaVaultItem = Get-Item -LiteralPath $idaVaultRoot
if ($idaVaultItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Le coffre ne peut pas être un lien.' }
$idaAcl = New-Object System.Security.AccessControl.DirectorySecurity
$idaAcl.SetAccessRuleProtection($true, $false)
$idaOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$idaRule = New-Object System.Security.AccessControl.FileSystemAccessRule($idaOwner, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$idaAcl.SetOwner($idaOwner)
$idaAcl.AddAccessRule($idaRule)
Set-Acl -LiteralPath $idaVaultRoot -AclObject $idaAcl
Write-Host 'Token Home Assistant dédié et révocable. Il ne sera pas affiché ni envoyé à IDA. Aucun appareil ne sera contacté.'
$idaToken = Read-Host 'Token (saisie masquée)' -AsSecureString
try {
  if ($idaToken.Length -lt 16 -or $idaToken.Length -gt 8192) { throw 'Longueur de token invalide' }
  $idaEncrypted = ConvertFrom-SecureString $idaToken
  $idaStream = [IO.File]::Open($idaSecretFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $idaBytes = [Text.Encoding]::UTF8.GetBytes($idaEncrypted); $idaStream.Write($idaBytes, 0, $idaBytes.Length) }
  finally { $idaStream.Dispose() }
  Write-Host 'Secret chiffré avec DPAPI CurrentUser. Même compte Windows requis pour le serveur. Connexion non activée.'
} finally { $idaToken.Dispose() }
