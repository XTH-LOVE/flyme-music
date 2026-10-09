# Flyme Music — 国内加速下载切换到 R2 镜像
# 一次性执行脚本。做五件事：
#   1. 创建 R2 存储桶 flyme-music-releases（已存在则跳过）
#   2. 开启 r2.dev 公开访问域名
#   3. 把 v0.8.7 的 APK 传到 R2
#   4. 在 Pages 项目设置 RELEASE_MIRROR 环境变量
#   5. 用干净的 main 提交构建并部署（不带上工作区未提交的改动）
#
# 用法：在 PowerShell 里执行
#   powershell -ExecutionPolicy Bypass -File D:\AuroraMusic\setup-r2-mirror.ps1
#
# 前提：本机 Cloudflare 登录有效。若任何一步报 401/授权错误，
# 先运行 npx wrangler login 重新登录，再重跑本脚本。

$ErrorActionPreference = 'Stop'
$Account = 'a6fc25eb5bd6e9ee026276d9c876b797'
$Bucket  = 'flyme-music-releases'
$Version = 'v0.8.7'
$ApkName = 'app-universal-release.apk'
$Project = 'flyme-music'
$Repo    = 'XTH-LOVE/flyme-music'

# ---------- 读取本机 Cloudflare 登录 ----------
$configPath = Join-Path $env:APPDATA 'xdg.config\.wrangler\config\default.toml'
$config = Get-Content $configPath -Raw
if ($config -notmatch 'oauth_token\s*=\s*"([^"]+)"') { throw '找不到 Cloudflare 登录，请先 npx wrangler login' }
$Token = $Matches[1]
$Headers = @{ Authorization = "Bearer $Token" }
$Base = "https://api.cloudflare.com/client/v4/accounts/$Account"

function Assert-Cf($resp, $what) {
  if (-not $resp.success) {
    $msg = ($resp.errors | ForEach-Object { "$($_.code) $($_.message)" }) -join '; '
    throw "$what 失败：$msg"
  }
}

# ---------- 1. 创建存储桶 ----------
Write-Host "== 1/5 创建 R2 存储桶 $Bucket =="
$exists = Invoke-RestMethod -Uri "$Base/r2/buckets/$Bucket" -Headers $Headers -ErrorAction SilentlyContinue
if (-not $exists.success) {
  $body = @{ name = $Bucket } | ConvertTo-Json
  $created = Invoke-RestMethod -Method Post -Uri "$Base/r2/buckets" -Headers ($Headers + @{ 'Content-Type' = 'application/json' }) -Body $body
  Assert-Cf $created '创建存储桶'
  Write-Host '   已创建'
} else {
  Write-Host '   已存在，跳过'
}

# ---------- 2. 开启公开访问域名 ----------
Write-Host "== 2/5 开启 r2.dev 公开访问 =="
$domainResp = Invoke-RestMethod -Uri "$Base/r2/buckets/$Bucket/domains/managed" -Headers $Headers -ErrorAction SilentlyContinue
$enabled = $domainResp.success -and $domainResp.result.enabled
if (-not $enabled) {
  $body = @{ enabled = $true } | ConvertTo-Json
  $domainResp = Invoke-RestMethod -Method Post -Uri "$Base/r2/buckets/$Bucket/domains/managed" -Headers ($Headers + @{ 'Content-Type' = 'application/json' }) -Body $body
  Assert-Cf $domainResp '开启公开访问'
}
$PublicBase = 'https://' + $domainResp.result.domain
Write-Host "   公开域名：$PublicBase"

# ---------- 3. 上传当前版本的 APK ----------
Write-Host "== 3/5 上传 $Version 的 APK =="
$key = "releases/$Version/$ApkName"
$head = Invoke-WebRequest -Uri "$PublicBase/$key" -Method Head -SkipHttpErrorCheck -ErrorAction SilentlyContinue
if ($head.StatusCode -eq 200) {
  Write-Host '   已存在，跳过上传'
} else {
  $tmp = Join-Path $env:TEMP $ApkName
  $url = "https://github.com/$Repo/releases/download/$Version/$ApkName"
  Write-Host "   从 GitHub 下载（约 77MB）……"
  Invoke-WebRequest -Uri $url -OutFile $tmp -UserAgent 'Flyme-Music-Setup'
  $size = (Get-Item $tmp).Length
  Write-Host ("   下载完成 {0:N1} MB，上传到 R2 ……" -f ($size / 1MB))
  $put = Invoke-RestMethod -Method Put -Uri "$Base/r2/buckets/$Bucket/objects/$key" -Headers $Headers -InFile $tmp
  Assert-Cf $put '上传 APK'
  Remove-Item $tmp
  Write-Host '   上传完成'
}

# ---------- 4. 设置 Pages 环境变量 ----------
Write-Host "== 4/5 设置 Pages 环境变量 RELEASE_MIRROR =="
$cfgUri = "$Base/pages/projects/$Project/deployment_configs"
$cfg = Invoke-RestMethod -Uri $cfgUri -Headers $Headers
if (-not $cfg.success) { throw '读取 Pages 配置失败' }
$prod = $cfg.result.production
if (-not $prod.env_vars) { $prod | Add-Member -NotePropertyName env_vars -NotePropertyValue @{} }
$prod.env_vars | Add-Member -NotePropertyName RELEASE_MIRROR -NotePropertyValue $PublicBase -Force
$patchBody = @{ production = @{ env_vars = $prod.env_vars } } | ConvertTo-Json -Depth 8
$patched = Invoke-RestMethod -Method Patch -Uri $cfgUri -Headers ($Headers + @{ 'Content-Type' = 'application/json' }) -Body $patchBody
Assert-Cf $patched '设置环境变量'
Write-Host '   已设置'

# ---------- 5. 干净构建并部署 ----------
Write-Host "== 5/5 用 main 的干净副本构建并部署 =="
$worktree = Join-Path $env:TEMP 'flyme-music-clean'
if (Test-Path $worktree) { git -C D:\AuroraMusic worktree remove $worktree --force }
git -C D:\AuroraMusic worktree add $worktree HEAD --detach
if (-not (Test-Path "$worktree\node_modules")) {
  New-Item -ItemType Junction -Path "$worktree\node_modules" -Target 'D:\AuroraMusic\node_modules' | Out-Null
}
Push-Location $worktree
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw '构建失败' }
npx wrangler pages deploy dist --project-name $Project --branch main --commit-dirty=true
Pop-Location
git -C D:\AuroraMusic worktree remove $worktree --force

Write-Host ''
Write-Host '全部完成。等部署生效（约 1 分钟）后：'
Write-Host "  - 新的「国内加速下载」地址：$PublicBase/releases/$Version/$ApkName"
Write-Host '  - 验证：打开 https://flyme-music.pages.dev/official#/android-download 点击下载'
Write-Host '  - 以后发版：release-android 工作流会自动把新 APK 传到 R2'
Write-Host '    （需要先在 GitHub 仓库 Secrets 配置 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /'
Write-Host '      R2_BUCKET=flyme-music-releases / R2_ACCOUNT_ID=' + $Account + '）'
