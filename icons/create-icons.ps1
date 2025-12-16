# ShieldGuard Icon Generator Script
# This script creates PNG icons for the Chrome extension

# Create a simple shield icon using pure bytes
# Since we can't use complex graphics without additional tools,
# we'll create minimal valid PNG files as placeholders

# You should replace these with proper icons by:
# 1. Opening icons/generate-icons.html in a browser
# 2. Clicking "Download All Icons as PNG"
# 3. Or using a graphics editor to create proper icons from the SVGs

Write-Host "ShieldGuard Icon Generator" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To generate proper PNG icons:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Use the HTML generator" -ForegroundColor Green
Write-Host "  1. Open 'icons/generate-icons.html' in Chrome/Edge"
Write-Host "  2. Click 'Download All Icons as PNG'"
Write-Host "  3. Move the downloaded files to the icons/ folder"
Write-Host ""
Write-Host "Option 2: Convert SVG files" -ForegroundColor Green
Write-Host "  1. Open icon16.svg, icon48.svg, icon128.svg in a browser or image editor"
Write-Host "  2. Export as PNG at the respective sizes"
Write-Host "  3. Save as icon16.png, icon48.png, icon128.png"
Write-Host ""
Write-Host "Option 3: Use online tools" -ForegroundColor Green
Write-Host "  1. Use an online SVG to PNG converter"
Write-Host "  2. Convert each SVG file to the appropriate PNG size"
Write-Host ""

# Check if Chrome is available to automate this
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if (Test-Path $chromePath) {
    Write-Host "Chrome detected! Opening the icon generator..." -ForegroundColor Green
    Start-Process $chromePath -ArgumentList (Resolve-Path "generate-icons.html")
} elseif (Test-Path $edgePath) {
    Write-Host "Edge detected! Opening the icon generator..." -ForegroundColor Green
    Start-Process $edgePath -ArgumentList (Resolve-Path "generate-icons.html")
} else {
    Write-Host "Please manually open generate-icons.html in your browser." -ForegroundColor Yellow
}
