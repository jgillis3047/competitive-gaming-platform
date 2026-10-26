# Allow inbound Metro (8081) on private networks (Wi‑Fi). Run once; may prompt for admin.
$ruleName = "Arena Expo Metro 8081"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists: $ruleName"
  exit 0
}
try {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8081 `
    -Profile Private `
    -ErrorAction Stop | Out-Null
  Write-Host "Added firewall rule for TCP 8081 (Private / home Wi‑Fi)."
} catch {
  Write-Host "Could not add firewall rule (try running PowerShell as Administrator):" -ForegroundColor Yellow
  Write-Host $_.Exception.Message
  exit 1
}
