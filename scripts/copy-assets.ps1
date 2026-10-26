# Copies generated app icon to project assets. Run from project root.
$src = "C:\Users\jorda\.cursor\projects\c-Users-jorda-Documents-gaming-app-54\assets\icon.png"
$destDir = "assets\images"
$dest = "$destDir\icon.png"

if (!(Test-Path $src)) {
    Write-Host "Source icon not found at $src" -ForegroundColor Yellow
    exit 1
}
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item $src $dest -Force
Write-Host "Copied icon to $dest" -ForegroundColor Green
