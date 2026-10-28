[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootItem = Get-Item -LiteralPath $projectRoot -Force
if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'Корень проекта не должен быть ссылкой или junction.'
}

function Get-SafeProjectFile([string] $RelativePath) {
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $RelativePath))
    $rootPrefix = $projectRoot.TrimEnd([char[]] '\/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Путь выходит за пределы проекта: $RelativePath"
    }
    $current = $projectRoot
    foreach ($part in ($RelativePath -split '[/\\]')) {
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Упаковка ссылок и junction запрещена: $RelativePath"
        }
    }
    if ($item.PSIsContainer) { throw "Ожидался файл: $RelativePath" }
    return $fullPath
}

# В архив включаются только перечисленные файлы, без рабочих настроек и данных.
$include = @(
    'extension/manifest.json'
    'extension/bridge.js'
    'extension/core.js'
    'extension/main.js'
    'extension/on.js'
    'extension/popup.html'
    'extension/popup.js'
    'extension/settings.html'
    'extension/settings.js'
    'extension/ui.css'
    'extension/worker.js'
    'extension/exceptions.example.json'
    'extension/icons/logo.svg'
    'extension/icons/icon16.png'
    'extension/icons/icon32.png'
    'extension/icons/icon48.png'
    'extension/icons/icon128.png'
)
$files = @{}
foreach ($relative in $include) { $files[$relative] = Get-SafeProjectFile $relative }
$manifest = Get-Content -LiteralPath $files['extension/manifest.json'] -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string] $manifest.version
if ($version -notmatch '^\d+(\.\d+){0,3}$') { throw 'В manifest.json указана некорректная версия.' }

$distPath = Join-Path $projectRoot 'dist'
if (Test-Path -LiteralPath $distPath) {
    $distItem = Get-Item -LiteralPath $distPath -Force
    if (-not $distItem.PSIsContainer -or ($distItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'Каталог dist не должен быть файлом, ссылкой или junction.'
    }
} else {
    New-Item -ItemType Directory -Path $distPath | Out-Null
}
$archiveName = "auto-confirm-chrome-app-v$version.zip"
$archivePath = Join-Path $distPath $archiveName
if (Test-Path -LiteralPath $archivePath) { $null = Get-SafeProjectFile "dist/$archiveName" }
$temporaryPath = Join-Path $distPath ('.package-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    $output = [System.IO.File]::Open($temporaryPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        $archive = [System.IO.Compression.ZipArchive]::new($output, [System.IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($relative in $include) {
                # Повторно проверяем путь непосредственно перед открытием.
                $sourcePath = Get-SafeProjectFile $relative
                $source = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
                try {
                    $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
                    $entryStream = $entry.Open()
                    try { $source.CopyTo($entryStream) } finally { $entryStream.Dispose() }
                } finally { $source.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $output.Dispose() }

    if (Test-Path -LiteralPath $archivePath) {
        $null = Get-SafeProjectFile "dist/$archiveName"
        [System.IO.File]::Replace($temporaryPath, $archivePath, [NullString]::Value)
    } else {
        [System.IO.File]::Move($temporaryPath, $archivePath)
    }
    Write-Output "Готово: dist/$archiveName ($($include.Count) файлов)."
} finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
}
