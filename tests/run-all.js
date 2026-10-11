// 一键跑测试:npm test(node 单元/回归测试 + 无需服务器的浏览器测试)
// npm run test:e2e 额外启动静态服务器(3000 端口)和联机中继 server.js(8080 端口),再跑 verify-* / audit-* 端到端脚本
// 浏览器测试需要 devDependencies 里的 playwright;没装时自动跳过
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const e2e = process.argv.includes('--e2e');
const hasPlaywright = (() => { try { require.resolve('playwright'); return true; } catch (e) { return false; } })();
const usesBrowser = f => /require\(['"]playwright['"]\)/.test(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const files = fs.readdirSync(__dirname).filter(f => /^test-.*\.js$/.test(f) || (e2e && /^(verify|audit)-.*\.js$/.test(f))).sort();

// 端到端脚本访问 http://localhost:3000/ 并连 ws://localhost:8080
function startServers() {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
    const web = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    }).listen(3000);
    const relay = spawn(process.execPath, [path.join(ROOT, 'server.js')], { stdio: 'ignore' });
    return () => { web.close(); relay.kill(); };
}

// 异步跑子进程:同进程里的静态服务器要能在测试运行期间响应请求
function run(f) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [path.join(__dirname, f)], { cwd: ROOT });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        const timer = setTimeout(() => child.kill(), 300000);
        child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
    });
}

(async () => {
    const stop = e2e ? startServers() : null;
    if (stop) await new Promise(r => setTimeout(r, 500));
    const rows = [];
    for (const f of files) {
        if (usesBrowser(f) && !hasPlaywright) { rows.push(['SKIP', f, 0]); continue; }
        const t0 = Date.now();
        const r = await run(f);
        const ok = r.status === 0;
        rows.push([ok ? 'PASS' : 'FAIL', f, Date.now() - t0]);
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        if (!ok) console.log(((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).map(l => '      ' + l).join('\n'));
    }
    if (stop) stop();
    const n = k => rows.filter(r => r[0] === k).length;
    console.log(`\n通过 ${n('PASS')} · 失败 ${n('FAIL')} · 跳过 ${n('SKIP')}(共 ${rows.length})`);
    process.exit(n('FAIL') ? 1 : 0);
})();
