# Route 53 hosted zone + records from change-batch.json (Windows).
# Prerequisites: AWS CLI v2, credentials (aws configure / aws sso login).
# Optional: set $env:DOMAIN = "yourdomain.com" and edit change-batch.json names accordingly.

$ErrorActionPreference = "Stop"

$AwsExe = @(
  "${env:ProgramFiles}\Amazon\AWSCLIV2\aws.exe",
  "${env:ProgramFiles(x86)}\Amazon\AWSCLIV2\aws.exe",
  "aws"
) | Where-Object { $_ -eq "aws" -or (Test-Path $_) } | Select-Object -First 1

if (-not $AwsExe) {
  Write-Error "AWS CLI not found. Install https://aws.amazon.com/cli/ or add aws to PATH."
}

function Invoke-Aws {
  if ($AwsExe -eq "aws") {
    & aws @args
  } else {
    & $AwsExe @args
  }
}

$Domain = if ($env:DOMAIN) { $env:DOMAIN } else { "shadowingnetwork.com" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ChangeBatchPath = Join-Path $ScriptDir "change-batch.json"
if (-not (Test-Path $ChangeBatchPath)) {
  Write-Error "Missing file: $ChangeBatchPath"
}

# AWS CLI on Windows expects file://D:/path (forward slashes)
$ChangeBatchUri = "file:///" + ($ChangeBatchPath -replace "\\", "/")

Write-Host "== IAM identity"
Invoke-Aws sts get-caller-identity

Write-Host "== Resolve hosted zone for $Domain"
function Get-ExactHostedZoneId([string]$dnsName) {
  $zonesJson = Invoke-Aws route53 list-hosted-zones-by-name --dns-name $dnsName --output json | ConvertFrom-Json
  foreach ($z in $zonesJson.HostedZones) {
    if ($z.Name -eq $dnsName) {
      return ($z.Id -replace "^/hostedzone/", "")
    }
  }
  return $null
}

$hzId = Get-ExactHostedZoneId "$Domain."

if (-not $hzId) {
  Write-Host "Creating hosted zone $Domain ..."
  Invoke-Aws route53 create-hosted-zone --name "$Domain." --caller-reference ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString())
  Start-Sleep -Seconds 3
  $hzId = Get-ExactHostedZoneId "$Domain."
  if (-not $hzId) { Write-Error "Hosted zone still missing after create for $Domain." }
}

Write-Host "HostedZoneId: $hzId"

Write-Host "== Apply DNS records from $ChangeBatchPath"
Invoke-Aws route53 change-resource-record-sets --hosted-zone-id $hzId --change-batch $ChangeBatchUri

Write-Host "== Nameservers (set at registrar for $Domain)"
Invoke-Aws route53 get-hosted-zone --id $hzId --query "DelegationSet.NameServers" --output text
