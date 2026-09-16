param(
    [Parameter(Mandatory = $true)][ValidateSet('groq', 'gemini', 'mistral', 'openai', 'elevenlabs')][string]$Provider,
    [Parameter(Mandatory = $true)][ValidatePattern('^wsp_[a-zA-Z0-9_]+$')][string]$WorkspaceId
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Le coffre requiert Windows et DPAPI CurrentUser.' }
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1" -ErrorAction Stop
# Saisie manuelle uniquement. Jamais de clé en argument, variable d'environnement ou requête navigateur.
$idaVaultRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.data/connector-secrets'))
$idaSecretFile = Join-Path $idaVaultRoot ($WorkspaceId + '.' + $Provider.ToLowerInvariant() + '.dpapi')
if (Test-Path -LiteralPath $idaSecretFile) {
    throw 'Un secret existe déjà. Aucun remplacement automatique ; révoquez la clé puis examinez son remplacement.'
}
# Refus des liens, y compris ceux d'un répertoire parent, avant toute création ou modification d'ACL.
$idaAncestor = $idaVaultRoot
while ($idaAncestor) {
    if (Test-Path -LiteralPath $idaAncestor) {
        $idaAncestorItem = Get-Item -LiteralPath $idaAncestor -Force
        if (!$idaAncestorItem.PSIsContainer -or ($idaAncestorItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Le coffre et ses parents doivent être des répertoires locaux sans lien.'
        }
    }
    $idaAncestor = [IO.Path]::GetDirectoryName($idaAncestor)
}
$null = New-Item -ItemType Directory -Path $idaVaultRoot -Force
$idaOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
# Reuse an already-private vault. Set-Acl with a freshly constructed owner/SACL
# can require SeSecurityPrivilege on standard Windows accounts even when the
# directory is already correctly protected; never fail a second provider for
# that reason. If the directory is new or not private, refuse instead of
# weakening permissions or attempting an elevation.
$idaExistingAcl = Get-Acl -LiteralPath $idaVaultRoot
$idaRules = @($idaExistingAcl.Access)
$idaPrivate = $idaExistingAcl.AreAccessRulesProtected -and
    $idaExistingAcl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $idaOwner.Value -and
    $idaRules.Count -eq 1 -and
    $idaRules[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $idaOwner.Value -and
    $idaRules[0].AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
    $idaRules[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl
if (-not $idaPrivate) {
    throw 'Le coffre existe mais ses ACL ne sont pas déjà privées pour ce compte. Corrigez-les explicitement puis relancez.'
}
Write-Host "Renseigne ta clé $Provider ici. Saisie masquée ; stockage chiffré sur ce PC uniquement."
Write-Host 'Aucun appel API, aucune connexion ni facturation ne seront activés par cette commande.'
$idaToken = Read-Host 'Clé API (ne pas la coller dans le Chat IDA ou Codex)' -AsSecureString
try {
    if ($idaToken.Length -lt 16 -or $idaToken.Length -gt 8192) { throw 'Longueur de clé invalide.' }
    $idaEncrypted = ConvertFrom-SecureString $idaToken
    $idaBytes = [Text.Encoding]::UTF8.GetBytes($idaEncrypted)
    if ($idaBytes.Length -ge 32768) { throw 'Clé trop longue pour le coffre borné. Aucun fichier créé.' }
    $idaStream = [IO.File]::Open($idaSecretFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $idaStream.Write($idaBytes, 0, $idaBytes.Length)
    } finally { $idaStream.Dispose() }
    Write-Host 'Clé enregistrée avec DPAPI CurrentUser, pour ce workspace et ce fournisseur uniquement.'
    if ($Provider -eq 'elevenlabs') {
        Write-Host 'Clé vocale enregistrée : le connecteur ElevenLabs reste PREPARED et aucun appel audio ne sera effectué automatiquement.'
    } else {
        Write-Host 'Activation encore bloquée : plan gratuit sans dépassement, quota réel et consentement cloud à vérifier.'
    }
    Write-Host 'La présence de ce fichier ne prouve pas que la clé fonctionne et ne modifie pas le registre en cours.'
} finally { $idaToken.Dispose() }
