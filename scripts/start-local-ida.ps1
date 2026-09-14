#requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$NodeExecutable,
    [switch]$EnableLocalDialogue,
    [string]$OllamaExecutable,
    [string]$PrivateBrowserOrigin,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$idaRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$idaTemp = Join-Path $idaRepo 'tmp'
$idaEntry = Join-Path $idaRepo 'apps/api/src/local-preview.ts'
$idaLoader = Join-Path $idaRepo 'node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs'
$idaData = Join-Path $idaTemp 'ida-preview-relative-dates/data'
$idaIndex = Join-Path $idaRepo 'apps/web/dist/index.html'

function Assert-RegularPath([string]$Path, [bool]$Directory = $false) {
    if (-not [IO.Path]::IsPathFullyQualified($Path)) { throw 'ABSOLUTE_PATH_REQUIRED' }
    $idaItem = Get-Item -LiteralPath $Path
    if ($idaItem.PSIsContainer -ne $Directory -or ($idaItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'RUNTIME_PATH_INVALID'
    }
}
function Get-IdaListeners {
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(8787, 11434) })
}
function Get-LocalJson([int]$Port, [string]$Path) {
    # Fixed numeric loopback; no proxy, credentials, redirect or retry.
    Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + $Path) -NoProxy -MaximumRedirection 0 -TimeoutSec 3
}

foreach ($idaPath in @($idaRepo, $idaTemp, (Split-Path $idaData), $idaData)) {
    Assert-RegularPath $idaPath $true
}
foreach ($idaPath in @($NodeExecutable, $idaEntry, $idaLoader, $idaIndex)) { Assert-RegularPath $idaPath }
if ($PrivateBrowserOrigin -and $PrivateBrowserOrigin -notmatch '^https://[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') {
    throw 'EXISTING_PRIVATE_HTTPS_ORIGIN_REQUIRED'
}
$idaPinText = Get-Content -LiteralPath (Join-Path $idaRepo 'apps/api/src/evaluation/local-model-pin.ts') -Raw
$idaModel = [regex]::Match($idaPinText, 'name: "([a-zA-Z0-9:._/-]+)"').Groups[1].Value
$idaDigest = [regex]::Match($idaPinText, 'digest: "([a-f0-9]{64})"').Groups[1].Value
if (-not $idaModel -or -not $idaDigest) { throw 'REVIEWED_MODEL_PIN_REQUIRED' }
if ($EnableLocalDialogue) {
    Assert-RegularPath $OllamaExecutable
    $idaSignature = Get-AuthenticodeSignature -LiteralPath $OllamaExecutable
    if ($idaSignature.Status -ne 'Valid' -or $idaSignature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Ollama Inc\.(,|$)') {
        throw 'OLLAMA_SIGNATURE_NOT_VERIFIED'
    }
    # Reviewed existing 0.33.3 executable, not an automatic installer/update.
    if ((Get-FileHash -LiteralPath $OllamaExecutable -Algorithm SHA256).Hash -ne 'E4FE6BD835FE146659F5C969DCCAFF2E25A9DE63D90EE204CA5D11B9034B0CA5') {
        throw 'OLLAMA_BINARY_CHANGED_NEEDS_REVIEW'
    }
}
$idaListeners = @(Get-IdaListeners)
if ($CheckOnly) {
    [pscustomobject]@{
        State = 'PREFLIGHT_ONLY'; Changes = $false; LocalDialogueRequested = [bool]$EnableLocalDialogue
        RequiredPorts = @(8787) + $(if ($EnableLocalDialogue) { @(11434) } else { @() })
        ExistingListeners = @($idaListeners | Select-Object LocalAddress, LocalPort, OwningProcess)
    } | ConvertTo-Json -Depth 3
    return
}
# Never kill/adopt another process or infer its cloud policy from a loopback socket.
if (@($idaListeners | Where-Object { $_.LocalPort -eq 8787 }).Count -gt 0) { throw 'IDA_ALREADY_RUNNING_STOP_AND_BACKUP_FIRST' }
if ($EnableLocalDialogue -and @($idaListeners | Where-Object { $_.LocalPort -eq 11434 }).Count -gt 0) {
    throw 'OLLAMA_ALREADY_RUNNING_NEEDS_REVIEW'
}
$idaOtherApi = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -match '[/\\]local-preview\.(ts|js)([\s"'']|$)'
})
if ($idaOtherApi.Count -gt 0) { throw 'IDA_PROCESS_ALREADY_EXISTS' }
$idaRun = Join-Path $idaTemp ('local-runtime-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $idaRun | Out-Null
$idaStarted = [Collections.Generic.List[Diagnostics.Process]]::new()
$idaDaemon = $null
$idaApi = $null
try {
    if ($EnableLocalDialogue) {
        $idaDaemon = Start-Process -FilePath $OllamaExecutable -ArgumentList 'serve' -WorkingDirectory $idaRepo `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $idaRun 'ollama.stdout.log') `
            -RedirectStandardError (Join-Path $idaRun 'ollama.stderr.log') -Environment @{
                OLLAMA_NO_CLOUD = '1'; OLLAMA_HOST = '127.0.0.1:11434'; OLLAMA_DEBUG = 'false'
                OLLAMA_MAX_LOADED_MODELS = '1'; OLLAMA_NUM_PARALLEL = '1'
            }
        $idaStarted.Add($idaDaemon)
        $idaReady = $false
        for ($idaAttempt = 0; $idaAttempt -lt 30; $idaAttempt++) {
            $idaDaemon.Refresh()
            if ($idaDaemon.HasExited) { throw 'OLLAMA_START_FAILED' }
            try {
                $idaVersion = Get-LocalJson 11434 '/api/version'
                if ($idaVersion.version -ne '0.33.3') { throw 'OLLAMA_VERSION_CHANGED_NEEDS_REVIEW' }
                $idaReady = $true
                break
            } catch {
                if ($_.Exception.Message -eq 'OLLAMA_VERSION_CHANGED_NEEDS_REVIEW') { throw }
            }
            Start-Sleep -Milliseconds 300
        }
        if (-not $idaReady) { throw 'OLLAMA_UNAVAILABLE' }
        $idaSocket = @(Get-IdaListeners | Where-Object { $_.LocalPort -eq 11434 })
        if ($idaSocket.Count -ne 1 -or $idaSocket[0].LocalAddress -ne '127.0.0.1' -or $idaSocket[0].OwningProcess -ne $idaDaemon.Id) {
            throw 'OLLAMA_LOOPBACK_OWNERSHIP_FAILED'
        }
        $idaInventory = Get-LocalJson 11434 '/api/tags'
        $idaModels = @($idaInventory.models | Where-Object { $_.name -eq $idaModel })
        if ($idaModels.Count -ne 1 -or $idaModels[0].digest -ne $idaDigest -or
            ($idaModels[0].PSObject.Properties.Name -contains 'remote_host') -or
            ($idaModels[0].PSObject.Properties.Name -contains 'remote_model')) {
            throw 'LOCAL_MODEL_PIN_MISMATCH_NO_DOWNLOAD_PERFORMED'
        }
    }
    # Node ESM --import requires a file URL for absolute Windows paths (C: is not a URL scheme).
    $idaLoaderUrl = ([Uri]$idaLoader).AbsoluteUri
    $idaArgs = '--import "' + $idaLoaderUrl + '" "' + $idaEntry + '"'
    $idaApi = Start-Process -FilePath $NodeExecutable -ArgumentList $idaArgs -WorkingDirectory $idaRepo `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $idaRun 'ida.stdout.log') `
        -RedirectStandardError (Join-Path $idaRun 'ida.stderr.log') -Environment @{
            IDA_BUILT_WEB = '1'; IDA_LOCAL_DIALOGUE = $(if ($EnableLocalDialogue) { '1' } else { '0' })
            OLLAMA_NO_CLOUD = '1'; IDA_PRIVATE_BROWSER_ORIGIN = $PrivateBrowserOrigin
        }
    $idaStarted.Add($idaApi)
    $idaAvailable = $false
    for ($idaAttempt = 0; $idaAttempt -lt 40; $idaAttempt++) {
        $idaApi.Refresh()
        if ($idaApi.HasExited) { throw 'IDA_START_FAILED' }
        try {
            $idaStatus = Get-LocalJson 8787 '/v1/auth/status'
            if ($idaStatus.data.mode -ne 'LOCAL_LOCK' -or $idaStatus.data.state -eq 'UNINITIALIZED') {
                throw 'EXISTING_LOCAL_LOCK_REQUIRED'
            }
            $idaAvailable = $true
            break
        } catch {
            if ($_.Exception.Message -eq 'EXISTING_LOCAL_LOCK_REQUIRED') { throw }
        }
        Start-Sleep -Milliseconds 300
    }
    if (-not $idaAvailable) { throw 'IDA_UNAVAILABLE' }
    $idaSocket = @(Get-IdaListeners | Where-Object { $_.LocalPort -eq 8787 })
    if ($idaSocket.Count -ne 1 -or $idaSocket[0].LocalAddress -ne '127.0.0.1' -or $idaSocket[0].OwningProcess -ne $idaApi.Id) {
        throw 'IDA_LOOPBACK_OWNERSHIP_FAILED'
    }
    [pscustomobject]@{
        State = 'STARTED_NOT_BROWSER_VERIFIED'; Url = 'http://127.0.0.1:8787'; ApiProcessId = $idaApi.Id
        OllamaProcessId = $(if ($null -ne $idaDaemon) { $idaDaemon.Id } else { $null })
        LocalDialogueEnabled = [bool]$EnableLocalDialogue; ModelPinVerified = [bool]$EnableLocalDialogue
        Logs = $idaRun; ExternalAccessVerified = $false
    } | ConvertTo-Json
} catch {
    # Roll back only process objects created by this invocation. No files/data removed.
    $idaFailure = $_
    for ($idaIndex = $idaStarted.Count - 1; $idaIndex -ge 0; $idaIndex--) {
        try {
            $idaProcess = $idaStarted[$idaIndex]
            $idaProcess.Refresh()
            if (-not $idaProcess.HasExited) { $idaProcess.Kill(); $idaProcess.WaitForExit(5000) | Out-Null }
        } catch {
            Write-Warning 'OWNED_PROCESS_CLEANUP_INCOMPLETE_CHECK_LOCAL_PORTS'
        }
    }
    throw $idaFailure
}
