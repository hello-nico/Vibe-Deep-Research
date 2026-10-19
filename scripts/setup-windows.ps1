param([switch]$SkipDoctor)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "$Step 失败（退出码 $LASTEXITCODE）" }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "未找到 Node.js。请先安装 Node.js 22 或更高版本。" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "未找到 npm。请重新安装 Node.js。" }
& node (Join-Path $root "scripts\check-node.mjs")
Assert-NativeSuccess "Node 运行时预检"

& npm ci --prefix orchestrator --no-audit --no-fund
Assert-NativeSuccess "安装 orchestrator 依赖"
& npm ci --prefix desktop --no-audit --no-fund
Assert-NativeSuccess "安装 desktop 依赖"
& npm ci --prefix desktop/dsh/runtime --no-audit --no-fund
Assert-NativeSuccess "安装固定版本 DSH"
& node (Join-Path $root "desktop\dsh\build-ui.mjs")
Assert-NativeSuccess "构建产品 UI 插件"
& node (Join-Path $root "desktop\dsh\setup.ts")
Assert-NativeSuccess "安装产品 DSH 插件"
& node (Join-Path $root "orchestrator\src\init.ts")
Assert-NativeSuccess "初始化产品目录"
if (-not $SkipDoctor) {
  & node (Join-Path $root "orchestrator\src\doctor.ts")
  $doctorExit = $LASTEXITCODE
  if ($doctorExit -notin @(0, 2)) { throw "运行产品体检失败（退出码 $doctorExit）" }
  if ($doctorExit -eq 2) { Write-Warning "产品体检有待处理警告；安装已完成，请按上方提示处理。" }
}

Write-Host "Windows 初始化完成。运行 scripts\start.cmd 打开 Vibe Finance。" -ForegroundColor Green
