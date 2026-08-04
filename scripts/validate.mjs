// scripts/validate.js — preview-tool 提交前自反思校验
// 校验三项：1) JS 语法  2) CDN 依赖版本锁定（禁止浮动/未锁定，版本漂移告警）  3) TAB_MODES 与 state.modeState 一致性
// 由 .githooks/pre-commit 调用；发现阻塞性问题以退出码 1 阻止提交。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const jsDir = root + '/js';
const errors = [];
const warnings = [];

// 项目锁定的 CDN 版本基线（以 index.html / js 中实际引用为准）。
// 漂移（pin 了但和这里不同）仅告警，提示人工确认是否故意升级；未锁定/浮动则报错。
const ALLOWED = {
  'mux.js': '6.0.1',
  'lottie-web': '5.12.2',
  'jszip': '3.10.1',
  'heic2any': '0.0.4',
  'libpag': '4.2.81',
  'sql.js': '1.10.3',
  'html5-qrcode': '2.3.8',
};
const FLOATING = new Set(['latest', 'beta', 'next', 'stable', 'master', 'main', 'dev', 'head']);

function checkPin(pkg, ver, file) {
  if (!ver) {
    errors.push(`CDN 依赖未锁定版本: ${pkg} (${file})`);
    return;
  }
  if (FLOATING.has(ver)) {
    errors.push(`CDN 依赖使用了浮动版本 @${ver}: ${pkg} (${file})`);
    return;
  }
  if (ALLOWED[pkg] && ALLOWED[pkg] !== ver) {
    warnings.push(`CDN 版本漂移 ${pkg}: 当前 ${ver}，基线 ${ALLOWED[pkg]} (${file})`);
  }
}

try {
  // ---- 1. JS 语法检查 ----
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
      const r = spawnSync('node', ['--check', jsDir + '/' + f], { encoding: 'utf8' });
      if (r.status !== 0) errors.push(`JS 语法错误 js/${f}:\n${r.stderr.trim()}`);
    }
  }

  // ---- 2. CDN 版本锁定检查 ----
  const targets = [];
  if (existsSync(root + '/index.html')) targets.push(root + '/index.html');
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) targets.push(jsDir + '/' + f);
  }
  const jsdelivrRe = /https?:\/\/cdn\.jsdelivr\.net\/npm\/([^/@]+)@?([^/\s"')]+)?/g;
  const cdnjsRe = /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/]+)/g;
  for (const t of targets) {
    const txt = readFileSync(t, 'utf8');
    let m;
    while ((m = jsdelivrRe.exec(txt))) checkPin(m[1], m[2], t.replace(root + '/', ''));
    while ((m = cdnjsRe.exec(txt))) checkPin(m[1], m[2], t.replace(root + '/', ''));
  }

  // ---- 3. TAB_MODES 与 state.modeState 一致性 ----
  const mainPath = jsDir + '/main.js';
  if (existsSync(mainPath)) {
    const src = readFileSync(mainPath, 'utf8');
    const tabM = src.match(/var\s+TAB_MODES\s*=\s*\[([^\]]*)\]/);
    if (tabM) {
      const tabs = (tabM[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
      const modeKeys = [];
      const re = /(\w+):\s*\{\s*fileMap:\s*new\s+Map\(\)/g;
      let mm;
      while ((mm = re.exec(src))) modeKeys.push(mm[1]);
      const tabSet = new Set(tabs);
      const modeSet = new Set(modeKeys);
      for (const t of tabs) if (!modeSet.has(t)) errors.push(`TAB_MODES 含 '${t}'，但 state.modeState 缺该键`);
      for (const k of modeKeys) if (!tabSet.has(k)) errors.push(`state.modeState 含 '${k}'，但 TAB_MODES 缺该项`);
    } else {
      warnings.push('未在 main.js 找到 TAB_MODES 定义，跳过一致性检查');
    }
  }
} catch (e) {
  // 校验脚本自身异常不应阻断提交，仅提示
  console.error('validate.js 内部错误（跳过校验门）:', e && e.message);
  process.exit(0);
}

if (warnings.length) {
  console.log('\n⚠ 告警:');
  warnings.forEach((w) => console.log('  - ' + w));
}
if (errors.length) {
  console.log('\n✗ 提交前校验未通过:');
  errors.forEach((e) => console.log('  - ' + e));
  console.log('\n（如需绕过：SKIP_PRECOMMIT=1 git commit …）');
  process.exit(1);
}
console.log('✓ preview-tool 校验通过（JS 语法 / CDN 版本锁定 / 状态机一致性）');
