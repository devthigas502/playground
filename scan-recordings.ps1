# scan-recordings.ps1
# Escaneia a pasta recordings/ e gera o arquivo recordings/manifest.json
# Uso: Executar este script sempre que adicionar/remover arquivos .codecast na pasta recordings/
#   powershell -ExecutionPolicy Bypass -File scan-recordings.ps1

$recordingsDir = Join-Path $PSScriptRoot "recordings"
$manifestPath = Join-Path $recordingsDir "manifest.json"

if (-not (Test-Path $recordingsDir)) {
    New-Item -ItemType Directory -Path $recordingsDir -Force | Out-Null
}

$files = Get-ChildItem -Path $recordingsDir -Filter "*.codecast" -File | Sort-Object Name

$entries = @()

foreach ($f in $files) {
    try {
        $content = Get-Content -Path $f.FullName -Raw -Encoding UTF8
        $json = $content | ConvertFrom-Json

        $title = if ($json.title) { $json.title } else { $f.BaseName }
        $duration = if ($json.duration) { [int]$json.duration } else { 0 }
        $eventCount = if ($json.events) { $json.events.Count } else { 0 }

        # Contar seções
        $sections = @()
        if ($json.events) {
            foreach ($evt in $json.events) {
                if ($evt.type -eq "section") {
                    $sections += @{
                        title = $evt.title
                        isExercise = [bool]$evt.isExercise
                    }
                }
            }
        }

        $entries += @{
            filename = $f.Name
            title = $title
            duration = $duration
            events = $eventCount
            sections = $sections
            size = $f.Length
            modified = $f.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss")
        }
    } catch {
        Write-Warning "Erro ao ler $($f.Name): $_"
    }
}

$manifest = @{
    generated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    count = $entries.Count
    recordings = $entries
}

$manifestJson = $manifest | ConvertTo-Json -Depth 4
Set-Content -Path $manifestPath -Value $manifestJson -Encoding UTF8

Write-Host ""
Write-Host "=== CodeCast - Scan de Gravacoes ===" -ForegroundColor Cyan
Write-Host "Pasta: $recordingsDir"
Write-Host "Gravacoes encontradas: $($entries.Count)" -ForegroundColor Green
foreach ($e in $entries) {
    $durSec = [math]::Floor($e.duration / 1000)
    $min = [math]::Floor($durSec / 60)
    $sec = $durSec % 60
    $durStr = "{0:D2}:{1:D2}" -f $min, $sec
    Write-Host "  - $($e.title) ($durStr) [$($e.filename)]" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Manifest gerado: $manifestPath" -ForegroundColor Green
Write-Host ""
