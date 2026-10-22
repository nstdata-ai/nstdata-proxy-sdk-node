import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
assert.ok(process.env.npm_execpath, 'Run npm run check:package');
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` };
const npm = (args, cwd) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, env, encoding: 'utf8', timeout: 30000,
});
const temp = mkdtempSync(join(tmpdir(), 'nstdata-proxy-package-'));
try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.name, '@nstdata-ai/proxy');
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].version, manifest.version);
    assert.equal(lock.packages[''].name, manifest.name);
    assert.equal(manifest.dependencies, undefined);
    const guides = ['README.md', 'README_zh.md'].map(name => readFileSync(join(root, name), 'utf8'));
    for (const guide of guides) assert.ok(guide.includes(`npm install ${manifest.name}@${manifest.version}`));
    const blocks = language => guides.map(guide => [...guide.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map(match => match[1]));
    assert.deepEqual(...blocks('sh'));
    assert.deepEqual(...blocks('js'));
    assert.equal(blocks('js')[0].length, 1);
    assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${manifest.version} — Unreleased`));
    const [pack] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root));
    assert.equal(pack.name, manifest.name);
    assert.equal(pack.version, manifest.version);
    const files = ['package.json', 'src/index.js', 'src/index.d.ts', 'README.md', 'README_zh.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md'];
    assert.deepEqual(pack.files.map(file => file.path).sort(), files.sort());
    assert.equal(manifest.exports['.'].types, './src/index.d.ts');
    assert.equal(manifest.exports['.'].import, './src/index.js');
    for (const name of files) {
        const text = readFileSync(join(root, name), 'utf8');
        assert.doesNotMatch(text, /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bnpm_[a-zA-Z0-9]{30,}\b|\bgh[pousr]_[a-zA-Z0-9]{20,}\b|\/Users\/|_planning\//);
        if (name.endsWith('.md')) for (const [, link] of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
            if (!link.includes('://')) assert.ok(existsSync(join(root, dirname(name), link)), `Missing documentation link: ${link}`);
        }
    }
    writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}\n');
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(temp, 'empty-cache'), join(temp, pack.filename)], temp);
    for (const name of files) assert.deepEqual(readFileSync(join(temp, 'node_modules/@nstdata-ai/proxy', name)), readFileSync(join(root, name)), name);
    mkdirSync(join(temp, 'test'));
    copyFileSync(join(root, 'test/client.test.mjs'), join(temp, 'test/client.test.mjs'));
    execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'test/client.test.mjs'], {
        cwd: temp, env: { ...env, NSTDATA_PROXY_INSTALLED: '1' }, timeout: 30000, stdio: 'inherit',
    });
    writeFileSync(join(temp, 'consumer.ts'), readFileSync(join(root, 'test/types.ts'), 'utf8').replace('../src/index.js', '@nstdata-ai/proxy'));
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022', 'consumer.ts'], {
        cwd: temp, env, timeout: 20000, stdio: 'inherit',
    });
    writeFileSync(join(temp, 'quickstart.mjs'), blocks('js')[0][0]);
    writeFileSync(join(temp, 'verify-quickstart.mjs'), `
import http from 'node:http';
import assert from 'node:assert/strict';
let count = 0;
const server = http.createServer((req, res) => {
    count++;
    assert.equal(req.url, '/api/v1/api/channels?page=1&pageSize=10');
    assert.equal(req.headers['x-api-key'], 'test-only-api-key');
    res.end(JSON.stringify({ data: [], err: false, code: 200 }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.NSTDATA_API_TOKEN = 'test-only-api-key';
process.env.NSTDATA_API_BASE_URL = 'http://127.0.0.1:' + server.address().port;
try { await import('./quickstart.mjs'); assert.equal(count, 1); }
finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
`);
    execFileSync(process.execPath, ['verify-quickstart.mjs'], { cwd: temp, env, timeout: 10000, stdio: 'inherit' });
    console.log(`PASS: ${files.length} exact package files, empty-cache install, installed-client tests, declarations and bilingual quick start`);
} finally { rmSync(temp, { recursive: true, force: true }); }
