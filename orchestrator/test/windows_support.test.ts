import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import "../src/finance/register.ts";
import { privateFilePermissions,restrictPrivateFile,restrictPrivateFileAsync } from "../src/fsutil.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const temp = (prefix = "vra-win-") => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test("Windows 安装脚本:优先 3.12 但允许其他受支持 Python 3；doctor 警告不伪装成安装失败", () => {
  const setup = fs.readFileSync(path.join(REPO, "scripts", "setup-windows.ps1"), "utf8");
  assert.match(setup, /py -3\.12 -c/);
  assert.match(setup, /else \{ & py -3 -m venv/);
  assert.match(setup, /sys\.version_info >= \(3, 11\)/);
  assert.match(setup, /\$doctorExit -notin @\(0, 2\)/);
  assert.doesNotMatch(setup, /Assert-NativeSuccess "运行产品体检"/);
});

test("Windows 私密文件权限不用 Unix mode 冒充 ACL 验证", { skip: process.platform !== "win32" }, async () => {
  const dir = temp();
  const file = path.join(dir, "private.txt");
  fs.writeFileSync(file, "secret", { mode: 0o600 });
  restrictPrivateFile(file);
  assert.equal(privateFilePermissions(file).secure, true, "收紧后必须断开继承且只留当前用户 SID");
  const asyncFile = path.join(dir, "private-async.txt");
  fs.writeFileSync(asyncFile, "");
  let eventLoopAdvanced = false;
  const timer = setTimeout(() => { eventLoopAdvanced = true; }, 0);
  try {
    await restrictPrivateFileAsync(asyncFile);
    assert.equal(eventLoopAdvanced, true, "等待 PowerShell 期间事件循环必须继续处理请求");
    assert.equal(privateFilePermissions(asyncFile).secure, true);
  } finally { clearTimeout(timer); }
});
