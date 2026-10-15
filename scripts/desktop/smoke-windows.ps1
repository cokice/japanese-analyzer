param([Parameter(Mandatory)][string]$Installer)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'This installer integration test must run on a disposable GitHub Windows runner.'
}

$installDirectory = Join-Path $env:RUNNER_TEMP 'japanese-analyzer-installed-smoke'
$dataDirectory = Join-Path $env:APPDATA 'ink.howen.japanese-analyzer'
$logPath = Join-Path $dataDirectory 'server.log'
$appProcess = $null
$installerProcess = $null
$ownedNodes = @()

try {
    $installerProcess = Start-Process -FilePath $Installer -ArgumentList '/S', "/D=$installDirectory" -PassThru
    if (-not $installerProcess.WaitForExit(120000)) { throw 'NSIS installation timed out.' }
    if ($installerProcess.ExitCode -ne 0) { throw "NSIS exited with $($installerProcess.ExitCode)." }
    foreach ($relative in @('japanese-analyzer-desktop.exe', 'resources/server/node.exe', 'resources/server/server.js', 'resources/server/.next/static')) {
        if (-not (Test-Path (Join-Path $installDirectory $relative))) { throw "Installed resource missing: $relative" }
    }
    Write-Host 'NSIS installed the desktop executable, bundled Node, and Next resources.'

    $previousReadyCount = 0
    if (Test-Path $logPath) {
        $previousReadyCount = [regex]::Matches([string](Get-Content $logPath -Raw), 'Main webview ready:').Count
    }
    $appProcess = Start-Process -FilePath (Join-Path $installDirectory 'japanese-analyzer-desktop.exe') -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(75)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw "Desktop exited during startup: $($appProcess.ExitCode)" }
        $ownedNodes = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($appProcess.Id)" |
            Where-Object { $_.Name -eq 'node.exe' } | Select-Object -ExpandProperty ProcessId)
        $portPath = Join-Path $dataDirectory 'server-port'
        if ((Test-Path $portPath) -and (Test-Path $logPath)) {
            $serverPort = [int]((Get-Content $portPath -Raw).Trim())
            $baseUrl = "http://127.0.0.1:$serverPort"
            $log = [string](Get-Content $logPath -Raw)
            $newPageLoaded = [regex]::Matches($log, 'Main webview ready:').Count -gt $previousReadyCount
            if ($newPageLoaded -and $log.Contains("Main webview ready: $baseUrl") -and
                $appProcess.MainWindowHandle -ne [IntPtr]::Zero -and $appProcess.Responding -and $ownedNodes.Count -eq 1) {
                $health = Invoke-RestMethod "$baseUrl/api/auth" -TimeoutSec 3
                if ($health.PSObject.Properties.Name -contains 'requiresAuth') {
                    $ready = $true
                    break
                }
            }
        }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw 'Installed desktop did not load the local application in a responsive window.' }
    Write-Host "Installed desktop reached $baseUrl in its own responsive WebView2 window."

    if (-not $appProcess.CloseMainWindow()) { throw 'Could not close the desktop main window.' }
    if (-not $appProcess.WaitForExit(15000)) { throw 'Desktop did not exit after closing its window.' }
    foreach ($nodeProcessId in $ownedNodes) {
        if (Get-Process -Id $nodeProcessId -ErrorAction SilentlyContinue) { throw "Bundled Node $nodeProcessId survived application exit." }
    }
    Write-Host 'Closing the installed application also stopped its bundled Node process.'
} catch {
    if (Test-Path $logPath) { Get-Content $logPath -Tail 80 | Write-Host }
    throw
} finally {
    if ($null -ne $appProcess -and -not $appProcess.HasExited) { $appProcess.Kill($true); $appProcess.WaitForExit() }
    foreach ($nodeProcessId in $ownedNodes) { Stop-Process -Id $nodeProcessId -Force -ErrorAction SilentlyContinue }
    if ($null -ne $installerProcess -and -not $installerProcess.HasExited) { $installerProcess.Kill($true) }
}
