param(
    [string]$Branch = "main",
    [int]$DebounceSeconds = 3
)

$targetPath = $PSScriptRoot
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   GreenCal Auto-Push Watcher Aktif                       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Memantau folder : $targetPath" -ForegroundColor Yellow
Write-Host "Target branch   : $Branch" -ForegroundColor Yellow
Write-Host "Debounce delay  : $DebounceSeconds detik" -ForegroundColor Yellow
Write-Host "Tekan Ctrl + C untuk menghentikan watcher.`n" -ForegroundColor Gray

function Trigger-Sync {
    try {
        $status = git status --porcelain
        if (-not [string]::IsNullOrWhiteSpace($status)) {
            Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Mendeteksi perubahan file:" -ForegroundColor Cyan
            $status | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }

            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Menjalankan git add..." -ForegroundColor Yellow
            git add -A

            $commitMsg = "Auto update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Menjalankan commit: '$commitMsg'..." -ForegroundColor Yellow
            git commit -m "$commitMsg"

            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Melakukan git push origin $Branch..." -ForegroundColor Yellow
            $pushOutput = git push origin $Branch 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [BERHASIL] Perubahan berhasil di-push ke GitHub!" -ForegroundColor Green
            } else {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [GAGAL PUSH] Detail:" -ForegroundColor Red
                $pushOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
            }
        }
    } catch {
        Write-Host "Error saat sinkronisasi: $_" -ForegroundColor Red
    }
}

# Inisialisasi watcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $targetPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$lastChange = [DateTime]::MinValue
$pending = $false

$action = {
    $path = $Event.SourceEventArgs.FullPath
    # Abaikan perubahan pada direktori .git
    if ($path -match "\\\.git\\") { return }

    $script:lastChange = [DateTime]::Now
    $script:pending = $true
}

$handlers = @(
    Register-ObjectEvent $watcher 'Changed' -Action $action,
    Register-ObjectEvent $watcher 'Created' -Action $action,
    Register-ObjectEvent $watcher 'Deleted' -Action $action,
    Register-ObjectEvent $watcher 'Renamed' -Action $action
)

try {
    while ($true) {
        Start-Sleep -Milliseconds 500
        if ($script:pending -and (([DateTime]::Now - $script:lastChange).TotalSeconds -ge $DebounceSeconds)) {
            $script:pending = $false
            Trigger-Sync
        }
    }
} finally {
    $handlers | ForEach-Object { Unregister-Event -SourceIdentifier $_.Name }
    $watcher.Dispose()
    Write-Host "`nWatcher dimatikan." -ForegroundColor Gray
}
