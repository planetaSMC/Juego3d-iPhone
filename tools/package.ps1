<#
    Empaqueta la carpeta completa en un ZIP para llevarla a la Mac o al iPhone.

    Incluye el sitio web, el proyecto Xcode, las herramientas y la
    documentacion. Excluye dist/ (el propio ZIP) y cualquier archivo temporal.

    Uso: powershell -ExecutionPolicy Bypass -File tools/package.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd'
$name = "RASMATIC-Lugar3D-iPhone-$stamp.zip"
$zip = Join-Path $dist $name
if (Test-Path $zip) { Remove-Item $zip -Force }

$items = Get-ChildItem -Path $root -Force | Where-Object {
  $_.Name -notin @('dist', '.git', 'node_modules')
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
$count = 0
try {
  foreach ($item in $items) {
    if ($item.PSIsContainer) {
      $files = Get-ChildItem -Path $item.FullName -Recurse -File -Force
    } else {
      $files = @($item)
    }
    foreach ($file in $files) {
      $rel = $file.FullName.Substring($root.Length + 1) -replace '\\', '/'
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $file.FullName, $rel,
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
      $count++
    }
  }
} finally {
  $archive.Dispose()
}

$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
$size = (Get-Item $zip).Length

# El hash se guarda al lado del ZIP, fuera del propio ZIP: asi no hay
# referencia circular (un archivo no puede contener su propio SHA-256).
$shaFile = "$zip.sha256"
[System.IO.File]::WriteAllText(
  $shaFile,
  ("{0}  {1}{2}" -f $hash.ToLowerInvariant(), $name, [Environment]::NewLine),
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host ("ZIP: {0}" -f $zip)
Write-Host ("     {0} B  ({1:N1} MB)" -f $size, ($size / 1MB))
Write-Host ("     SHA-256 {0}" -f $hash)
Write-Host ("     {0} entradas" -f $count)
Write-Host ("     firma: {0}" -f $shaFile)
