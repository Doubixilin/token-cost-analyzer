import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = resolve(root, "docs/assets/xiaohongshu");
const screenshotDir = resolve(root, "docs/assets/screenshots");
const chromeCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

function fileUrl(path) {
  return pathToFileURL(path).href;
}

function img(name) {
  return fileUrl(resolve(screenshotDir, name));
}

function findChrome() {
  for (const candidate of chromeCandidates) {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", `Test-Path -LiteralPath '${candidate}'`],
      { encoding: "utf8" },
    );
    if (result.stdout.trim().toLowerCase() === "true") return candidate;
  }
  throw new Error("Chrome or Edge executable not found");
}

const baseCss = `
*{box-sizing:border-box}
html,body{
  margin:0;width:100%;height:100%;overflow:hidden;background:#2b336d;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif;
  color:#10213f
}
.poster{
  position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;padding:68px 64px;
  background:
    radial-gradient(circle at 14% 12%,rgba(126,87,255,.24),transparent 34%),
    radial-gradient(circle at 88% 6%,rgba(58,143,255,.22),transparent 28%),
    linear-gradient(154deg,#f7fbff 0%,#edf2ff 46%,#f8fbff 100%)
}
.poster.dark{
  background:radial-gradient(circle at 0% 0%,#78437f 0%,transparent 38%),linear-gradient(150deg,#432f70 0%,#26386b 100%);
  color:#f8fbff
}
.badge{
  display:inline-flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;
  background:#eaf1ff;color:#2f6ef8;font-weight:900;font-size:28px
}
.dark .badge{background:rgba(255,255,255,.12);color:#9fd0ff;border:1px solid rgba(255,255,255,.16)}
h1{margin:30px 0 0;font-size:78px;line-height:1.06;letter-spacing:0;font-weight:900}
h2{margin:18px 0 0;font-size:42px;line-height:1.22;color:#5e6e89;font-weight:800}
.dark h2{color:#c7d2ef}
.lead{font-size:31px;line-height:1.55;color:#536783;margin-top:24px}
.dark .lead{color:#d8def3}
.card{
  background:rgba(255,255,255,.88);border:1px solid rgba(132,149,180,.22);
  box-shadow:0 18px 48px rgba(44,62,102,.14);border-radius:34px
}
.dark .card{background:rgba(27,31,69,.52);border-color:rgba(255,255,255,.18);box-shadow:0 24px 60px rgba(4,9,28,.28)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.feature{padding:28px}
.feature b{font-size:31px;display:block;margin-bottom:10px}
.feature p{margin:0;font-size:22px;line-height:1.45;color:#5d6e89}
.dark .feature p{color:#c5cce6}
.icon{
  width:54px;height:54px;border-radius:18px;background:linear-gradient(135deg,#3888ff,#8c5cff);
  color:white;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;margin-bottom:18px
}
.shot{display:block;width:100%;height:100%;object-fit:cover}
.shot.top{object-position:top}
.shot.contain{object-fit:contain;background:#f4f7fb}
.phone{border-radius:38px;overflow:hidden;border:8px solid rgba(255,255,255,.62);box-shadow:0 30px 80px rgba(14,25,60,.34)}
.dark .phone{border-color:rgba(255,255,255,.16)}
.footer{
  position:absolute;left:64px;right:64px;bottom:54px;display:flex;justify-content:space-between;align-items:center;
  font-size:24px;color:#6a7893
}
.dark .footer{color:#c9d3ef}
.tagline{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}
.tagline span{font-size:22px;font-weight:900;padding:10px 16px;border-radius:999px;background:rgba(47,110,248,.1);color:#2f6ef8}
.dark .tagline span{background:rgba(255,255,255,.1);color:#dbe7ff}
.section-title{font-size:45px;font-weight:900;margin:0 0 20px}
.note{font-size:20px;color:#7b88a1;line-height:1.45}
.dark .note{color:#ccd5ef}
.flow{display:grid;gap:18px;margin-top:28px}
.flow .step{display:flex;align-items:center;gap:20px;padding:24px 28px}
.step .num{
  width:48px;height:48px;border-radius:16px;background:#2f6ef8;color:#fff;font-size:25px;font-weight:900;
  display:flex;align-items:center;justify-content:center;flex:0 0 auto
}
.step b{font-size:29px}
.step span{display:block;font-size:21px;color:#667590;margin-top:4px}
.dark .step span{color:#c4cbe6}
.repo-box{padding:34px;margin-top:36px}
.repo-url{font-size:31px;line-height:1.28;font-weight:900;color:#2f6ef8;word-break:break-all}
.dark .repo-url{color:#9fd0ff}
.install{display:grid;gap:18px;margin-top:28px}
.install .row{display:grid;grid-template-columns:72px 1fr;gap:20px;align-items:center;padding:22px 24px;border-radius:28px;background:rgba(255,255,255,.74)}
.dark .install .row{background:rgba(255,255,255,.1)}
.install .row strong{font-size:30px;display:block}
.install .row span{font-size:22px;line-height:1.35;color:#5c6d88}
.dark .install .row span{color:#c7d2ef}
`;

const posters = [
  {
    file: "01-overview.png",
    html: `
      <div class="poster dark">
        <div class="badge">开源 · 免费 · 本地优先</div>
        <h1>Token Cost<br/>Analyzer</h1>
        <h2>AI Coding 工具 Token 成本与用量仪表盘</h2>
        <p class="lead">自动读取 Kimi Code、Claude Code、Codex 本地日志，统计 Token、缓存命中、成本估算和趋势变化。</p>
        <div class="tagline"><span>隐私保护</span><span>桌面小组件</span><span>CNY / USD</span><span>Excel 报告</span></div>
        <div class="phone" style="margin-top:48px;height:610px"><img class="shot top" src="${img("widget-compact-dark.png")}"/></div>
        <div class="footer"><b>Windows · Tauri 2</b><span>数据只在本机处理</span></div>
      </div>`,
  },
  {
    file: "02-features.png",
    html: `
      <div class="poster">
        <div class="badge">主要功能</div>
        <h1 style="font-size:68px">把 AI 编码消耗<br/>看清楚</h1>
        <h2>从总览、趋势到悬浮小组件，一套工具覆盖日常复盘。</h2>
        <div class="grid2" style="margin-top:44px">
          <div class="card feature"><div class="icon">T</div><b>Token 全景统计</b><p>输入、输出、缓存读取、缓存创建分项展示。</p></div>
          <div class="card feature"><div class="icon">¥</div><b>成本估算</b><p>默认 CNY 显示，可切换 USD 并自定义汇率。</p></div>
          <div class="card feature"><div class="icon">↗</div><b>趋势分析</b><p>日/小时维度图表，定位高消耗时段。</p></div>
          <div class="card feature"><div class="icon">▣</div><b>桌面小组件</b><p>半透明、深色模式、可拖动缩放。</p></div>
          <div class="card feature"><div class="icon">↻</div><b>增量同步</b><p>只处理新增或变化的日志，启动更轻。</p></div>
          <div class="card feature"><div class="icon">X</div><b>报告导出</b><p>支持 CSV、JSON、Excel 分析报告。</p></div>
        </div>
        <div class="footer"><b>Open Source & Free</b><span>MIT License</span></div>
      </div>`,
  },
  {
    file: "03-architecture.png",
    html: `
      <div class="poster">
        <div class="badge">技术方案</div>
        <h1 style="font-size:66px">本地日志解析<br/>本地数据库分析</h1>
        <h2>没有云端中转，没有账号绑定，适合长期记录自己的 AI 编码成本。</h2>
        <div class="flow">
          <div class="card step"><div class="num">1</div><div><b>Local Logs</b><span>读取 Kimi、Claude、Codex 本地会话 JSONL</span></div></div>
          <div class="card step"><div class="num">2</div><div><b>Rust Parser</b><span>按工具适配 usage 字段，Codex 状态事件去重</span></div></div>
          <div class="card step"><div class="num">3</div><div><b>SQLite Store</b><span>增量同步、去重索引、会话聚合、成本重算</span></div></div>
          <div class="card step"><div class="num">4</div><div><b>React + ECharts</b><span>仪表盘、分析视图、悬浮窗和导出报告</span></div></div>
        </div>
        <div class="card" style="margin-top:34px;padding:32px">
          <p class="section-title">Privacy by Design</p>
          <p class="note" style="font-size:26px">所有 Token 记录、项目路径、会话摘要都保存在本机 SQLite。应用不上传日志，不需要外部服务，也不读取云端账号数据。</p>
        </div>
        <div class="footer"><b>Tauri 2 · Rust · React · SQLite</b><span>轻量桌面应用</span></div>
      </div>`,
  },
  {
    file: "04-real-ui.png",
    html: `
      <div class="poster dark">
        <div class="badge">真实页面渲染</div>
        <h1 style="font-size:64px">不是概念图<br/>是真的能用</h1>
        <h2>以下画面来自项目真实界面截图，适合记录日常 AI Coding 成本。</h2>
        <div class="card" style="padding:22px;margin-top:34px;height:500px"><img class="shot contain" src="${img("dashboard-trend-light.png")}"/></div>
        <div class="grid2" style="margin-top:24px">
          <div class="phone" style="height:360px"><img class="shot" src="${img("widget-large-dark.png")}"/></div>
          <div class="phone" style="height:360px"><img class="shot" src="${img("widget-settings-dark.png")}"/></div>
        </div>
        <div class="footer"><b>Token Cost Analyzer v0.3.3</b><span>开源免费 · 本地隐私</span></div>
      </div>`,
  },
  {
    file: "05-github-install.png",
    html: `
      <div class="poster dark">
        <div class="badge">GitHub 仓库 · 欢迎参与</div>
        <h1 style="font-size:68px">喜欢就点 Star<br/>问题欢迎反馈</h1>
        <h2>开源、免费、本地优先。适合给 AI Coding 成本做长期记录。</h2>
        <div class="card repo-box">
          <p class="note" style="font-size:24px;margin:0 0 12px">远程仓库地址</p>
          <div class="repo-url">github.com/Doubixilin/token-cost-analyzer</div>
        </div>
        <div class="install">
          <div class="row"><div class="icon">★</div><div><strong>欢迎 Star</strong><span>如果这个工具帮你看清 AI 编码成本，欢迎在 GitHub 点亮 Star。</span></div></div>
          <div class="row"><div class="icon">!</div><div><strong>提交 Issue</strong><span>遇到统计异常、界面问题或新工具适配需求，可以提交问题和反馈。</span></div></div>
          <div class="row"><div class="icon">v</div><div><strong>当前版本 v0.3.3</strong><span>最新 Windows 构建：token-cost-analyzer-windows.exe。</span></div></div>
          <div class="row"><div class="icon">↓</div><div><strong>安装方式</strong><span>打开仓库 Releases，下载 Windows exe，双击运行后在设置页同步本地日志。</span></div></div>
        </div>
        <div class="tagline"><span>MIT License</span><span>永久免费</span><span>本地 SQLite</span><span>隐私保护</span></div>
        <div class="footer"><b>Token Cost Analyzer</b><span>AI Coding Token Cost Dashboard</span></div>
      </div>`,
  },
];

const chrome = findChrome();
const temp = mkdtempSync(join(tmpdir(), "token-cost-posters-"));

try {
  for (const poster of posters) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss}</style></head><body>${poster.html}</body></html>`;
    const htmlPath = join(temp, poster.file.replace(".png", ".html"));
    const outPath = resolve(outDir, poster.file);
    writeFileSync(htmlPath, html, "utf8");
    const result = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
        "--force-device-scale-factor=1",
        "--window-size=1080,1440",
        `--screenshot=${outPath}`,
        fileUrl(htmlPath),
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(`Failed to render ${poster.file}\n${result.stderr || result.stdout}`);
    }
    console.log(`Rendered ${outPath}`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
