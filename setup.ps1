# Isläge – första uppsättningen. Kör i PowerShell från mappen Documents\Islage:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Kräver git och GitHub CLI (gh). Installera gh med:  winget install GitHub.cli   och logga in:  gh auth login
param([string]$Repo = "geapanenbanan/islage")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. Workflow-filerna till rätt plats
New-Item -ItemType Directory -Force -Path ".github\workflows" | Out-Null
Move-Item -Force "github-workflows\*.yml" ".github\workflows\"
Remove-Item -Force "github-workflows" -ErrorAction SilentlyContinue

# 2. Git + GitHub
if (-not (Test-Path ".git")) { git init -b main | Out-Null }
git add -A
git commit -m "Isläge: första versionen" | Out-Null
gh repo create $Repo --public --source . --remote origin --push
Write-Host ""
Write-Host "Klart! Repot finns på https://github.com/$Repo" -ForegroundColor Green
Write-Host "Nästa steg (en gång): Cloudflare → Workers & Pages → Create → Import a repository → välj $Repo."
Write-Host "Inställningarna läses från wrangler.jsonc. Sajten hamnar på https://islage.geapanenbanan.com"
