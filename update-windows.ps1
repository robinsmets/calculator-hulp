# Updates an installed Calculator hulp (or P3-Calculatorhulp-tool) to the
# latest release on GitHub, in place, so Chrome keeps loading the same folder.
# The Windows counterpart of update-mac.sh.
#
# Published in both GitHub repositories and run with one line in PowerShell:
#   irm https://raw.githubusercontent.com/robinsmets/calculator-hulp/main/update-windows.ps1 | iex
#
# Run through iex, so `exit` would close the colleague's PowerShell window:
# everything sits in a function that returns instead. Texts stay ASCII, since
# Windows PowerShell 5.1 can misread other characters in a downloaded script.

function Update-CalculatorHulp {
  $ErrorActionPreference = "Stop"
  # Windows PowerShell 5.1 does not offer TLS 1.2 by default; GitHub needs it.
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $remembered = Join-Path $env:USERPROFILE ".calculator-hulp-map"

  # The folder Chrome loads the extension from. Asked once, then remembered.
  $folder = ""
  if (Test-Path $remembered) { $folder = (Get-Content $remembered -Raw).Trim() }
  if (-not $folder -or -not (Test-Path (Join-Path $folder "manifest.json"))) {
    Write-Host "Kies de map van de extensie (de map met manifest.json)."
    try {
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = "Kies de map van de Calculator hulp (de map met manifest.json)"
      if ($dialog.ShowDialog() -ne "OK") { Write-Host "Geen map gekozen. Er is niets veranderd."; return }
      $folder = $dialog.SelectedPath
    } catch {
      $folder = (Read-Host "Plak het pad van de map").Trim('"', ' ')
    }
  }

  $manifestPath = Join-Path $folder "manifest.json"
  if (-not (Test-Path $manifestPath)) {
    Write-Host "In `"$folder`" staat geen manifest.json. Kies de map die je in chrome://extensions hebt geladen."
    return
  }

  # Which extension this is decides which repository to update from.
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  switch ($manifest.name) {
    "Calculator hulp" { $repo = "robinsmets/calculator-hulp" }
    "P3-Calculatorhulp-tool" { $repo = "robinsmets/P3-Calculatorhulp-tool" }
    default { Write-Host "Onbekende extensie in deze map: `"$($manifest.name)`"."; return }
  }
  $current = $manifest.version

  $release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing
  $latest = $release.tag_name -replace "^v", ""
  $asset = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
  if (-not $asset) { Write-Host "Geen download gevonden op GitHub. Probeer het later opnieuw."; return }

  Set-Content -Path $remembered -Value $folder

  # A desktop icon that runs this same line, so the next update is a double
  # click. Made here rather than downloaded: a file created on the machine
  # itself carries no internet mark, so SmartScreen does not warn about it.
  # A .bat cannot carry an icon, so it lives in a folder of its own and the
  # desktop gets a shortcut to it with the logo. Cosmetic: a failure here must
  # not stop the update. GetFolderPath, because the desktop is often moved
  # into OneDrive.
  try {
    $home_folder = Join-Path $env:USERPROFILE ".calculator-hulp"
    New-Item -ItemType Directory -Force -Path $home_folder | Out-Null
    $batch = Join-Path $home_folder "bijwerken.bat"
    $line = "powershell -NoProfile -ExecutionPolicy Bypass -Command `"irm https://raw.githubusercontent.com/$repo/main/update-windows.ps1 | iex`""
    Set-Content -Path $batch -Value @("@echo off", $line, "pause") -Encoding Ascii
    $icon = Join-Path $home_folder "update-icon.ico"
    Invoke-WebRequest "https://raw.githubusercontent.com/$repo/main/update-icon.ico" -OutFile $icon -UseBasicParsing

    $desktop = [Environment]::GetFolderPath("Desktop")
    # The plain .bat an earlier version of this script put on the desktop.
    Remove-Item (Join-Path $desktop "Calculator hulp bijwerken.bat") -ErrorAction SilentlyContinue
    $shortcut = Join-Path $desktop "Calculator hulp bijwerken.lnk"
    $isNew = -not (Test-Path $shortcut)
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
    $link.TargetPath = $batch
    $link.IconLocation = "$icon,0"
    $link.Save()
    if ($isNew) {
      Write-Host "Op je bureaublad staat nu `"Calculator hulp bijwerken`": dubbelklik daarop voor de volgende update."
    }
  } catch {
    Write-Host "Het icoon op het bureaublad kon niet worden gemaakt; het bijwerken gaat gewoon door."
  }

  if ($current -eq $latest) { Write-Host "$($manifest.name) $current is al de nieuwste versie."; return }

  $work = Join-Path $env:TEMP ("calculator-hulp-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $zip = Join-Path $work "update.zip"
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
    $new = Join-Path $work "new"
    Expand-Archive -Path $zip -DestinationPath $new

    if (-not (Test-Path (Join-Path $new "manifest.json"))) {
      Write-Host "De download is niet compleet. Er is niets veranderd."
      return
    }

    # /MIR drops files a newer version no longer has, so the folder ends up
    # exactly like the release. Robocopy reports success with codes below 8.
    robocopy $new $folder /MIR /NJH /NJS /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Host "Bijwerken mislukt (robocopy $LASTEXITCODE)."; return }
  } finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }

  Write-Host "$($manifest.name) bijgewerkt van $current naar $latest."
  Write-Host "Klik nu in chrome://extensions bij de extensie op het rondje (opnieuw laden), of herstart Chrome."
  try { Start-Process "chrome.exe" "chrome://extensions" } catch { }
}

Update-CalculatorHulp
