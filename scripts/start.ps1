$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$reclaimAny = $args -contains "--reclaim-any"
# Node 运行时预检:版本不够或构建未启用 TypeScript 支持时给出指引,而不是 ERR_UNKNOWN_FILE_EXTENSION(#38)
& node (Join-Path $root "scripts\check-node.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$api = $null
$ui = $null
function Stop-ProcessTree($Process) {
  if (-not $Process) { return }
  $rootId = [int]$Process.Id
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId)
  $pending = [System.Collections.Generic.Queue[int]]::new()
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $descendants = [System.Collections.Generic.List[int]]::new()
  $pending.Enqueue($rootId)
  [void]$seen.Add($rootId)
  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    foreach ($child in $all) {
      $childId = [int]$child.ProcessId
      if ([int]$child.ParentProcessId -eq $parentId -and $seen.Add($childId)) {
        $descendants.Add($childId)
        $pending.Enqueue($childId)
      }
    }
  }
  # 父进程已退出时 taskkill /PID <parent> /T 找不到树根；
  # CIM 快照里的 ParentProcessId 仍能让我们定位遗留子孙。
  foreach ($targetId in @($descendants | Sort-Object -Descending)) {
    & taskkill.exe /PID $targetId /T /F *> $null
  }
  $Process.Refresh()
  if (-not $Process.HasExited) {
    & taskkill.exe /PID $rootId /T /F *> $null
  }
}
function Reset-ProductPort([int]$Port) {
  $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($connections.Count -eq 0) { return }
  $owners = @()
  foreach ($connection in $connections) {
    $ownerId = [int]$connection.OwningProcess
    if ($ownerId -le 0) { continue }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue
    $owners += [pscustomobject]@{ Id = $ownerId; CommandLine = [string]$info.CommandLine }
  }
  $owners = @($owners | Sort-Object Id -Unique)
  # 只有命令行里带本仓库路径的进程才算"上一轮运行留下的"；不认识的一律不动。
  $normalizedRoot = $root.ToLowerInvariant()
  $own = @($owners | Where-Object { $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot) })
  $foreign = @($owners | Where-Object { -not $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot) })
  if ($foreign.Count -gt 0 -and -not $reclaimAny) {
    $detail = ($foreign | ForEach-Object { "PID $($_.Id)" }) -join "、"
    throw "端口 $Port 被其他程序的进程占用（$detail）。请先结束该进程后再启动，或用 --reclaim-any 结束后重试。"
  }
  $targets = if ($reclaimAny) { $owners } else { $own }
  if ($targets.Count -eq 0) {
    throw "端口 $Port 已被占用，但无法定位占用进程。请先结束占用该端口的进程再启动。"
  }
  foreach ($target in $targets) {
    Write-Host "[start] 端口 $Port 已被上一轮运行占用（PID $($target.Id)），正在结束。"
    $owner = Get-Process -Id $target.Id -ErrorAction SilentlyContinue
    if ($owner) { Stop-ProcessTree $owner }
  }
  $portDeadline = [DateTime]::UtcNow.AddSeconds(5)
  while ([DateTime]::UtcNow -lt $portDeadline) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "已结束占用 $Port 的进程，但端口仍未释放，请手动确认后重试。"
}
try {
  # pre-start：回收上一轮本仓库留下的独立数据服务与界面进程。产品数据服务由 DSH 插件挂载。
  Reset-ProductPort 8765
  Reset-ProductPort 5930
  $ui = Start-Process -FilePath npm.cmd -ArgumentList @("run", "dev", "--prefix", "desktop") -WorkingDirectory $root -PassThru -NoNewWindow
  $ready = $false
  $readyDeadline = [DateTime]::UtcNow.AddSeconds(60)
  while ([DateTime]::UtcNow -lt $readyDeadline) {
    $ui.Refresh()
    if ($ui.HasExited) { throw "界面启动失败（退出码 $($ui.ExitCode)）。" }
    try {
      $probe = Invoke-WebRequest -Uri "http://127.0.0.1:5930" -UseBasicParsing -TimeoutSec 2
      if ($probe.StatusCode -ge 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "启动等待超过 60 秒。请检查上方日志、5930 端口以及产品配置；浏览器尚未打开。" }
  $ui.Refresh()
  if ($ui.HasExited) { throw "界面启动失败（退出码 $($ui.ExitCode)）。" }
  Start-Process "http://127.0.0.1:5930"
  while (-not $ui.HasExited) {
    Start-Sleep -Milliseconds 250
    $ui.Refresh()
  }
  if ($ui.HasExited) { throw "界面已提前停止（退出码 $($ui.ExitCode)）。" }
} finally {
  Stop-ProcessTree $ui
}
