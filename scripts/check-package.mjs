import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
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
    const featureGuides = ['docs/guide.md', 'docs/guide_zh.md'].map(name => readFileSync(join(root, name), 'utf8'));
    const featurePrograms = featureGuides.map(text => [...text.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]));
    assert.deepEqual(...featurePrograms);
    assert.equal(featurePrograms[0].length, 4);
    for (const guide of guides) assert.ok(guide.includes(`npm install ${manifest.name}@${manifest.version}`));
    const blocks = language => guides.map(guide => [...guide.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map(match => match[1]));
    assert.deepEqual(...blocks('sh'));
    assert.deepEqual(...blocks('js'));
    assert.equal(blocks('js')[0].length, 1);
    assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${manifest.version} — Unreleased`));
    const [pack] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root));
    assert.equal(pack.name, manifest.name);
    assert.equal(pack.version, manifest.version);
    const files = ['package.json', 'src/index.js', 'src/index.d.ts', 'README.md', 'README_zh.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/guide.md', 'docs/guide_zh.md'];
    assert.deepEqual(pack.files.map(file => file.path).sort(), files.sort());
    assert.equal(manifest.exports['.'].types, './src/index.d.ts');
    assert.equal(manifest.exports['.'].import, './src/index.js');
    for (const name of files) {
        const text = readFileSync(join(root, name), 'utf8');
        assert.doesNotMatch(text, /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bnpm_[a-zA-Z0-9]{30,}\b|\bgh[pousr]_[a-zA-Z0-9]{20,}\b|\/Users\/|_planning\//);
        if (name.endsWith('.md')) for (const [, link] of text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
            if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link)) continue;
            const [relative, anchor] = link.split('#');
            const linked = relative ? join(root, dirname(name), relative) : join(root, name);
            assert.ok(existsSync(linked), `Missing documentation link: ${link}`);
            if (anchor) {
                const slugs = [...readFileSync(linked, 'utf8').matchAll(/^#+ (.+)$/gm)].map(match =>
                    match[1].toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replaceAll(' ', '-'));
                assert.ok(slugs.includes(anchor), `Missing documentation anchor: ${link}`);
            }
        }
    }
    writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}\n');
    const archive = process.argv[2] ? resolve(process.argv[2]) : join(temp, pack.filename);
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(temp, 'empty-cache'), archive], temp);
    const installed = join(temp, 'node_modules/@nstdata-ai/proxy');
    const installedFiles = readdirSync(installed, { recursive: true })
        .filter(name => statSync(join(installed, name)).isFile()).map(name => name.split(sep).join('/'));
    assert.deepEqual(installedFiles.sort(), files.sort());
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
    for (const [index, program] of featurePrograms[0].entries()) {
        writeFileSync(join(temp, 'feature.mjs'), `import { ProxyClient } from '@nstdata-ai/proxy';
const client = new ProxyClient({ apiKey: process.env.NSTDATA_API_TOKEN, baseUrl: process.env.NSTDATA_API_BASE_URL });
${program}`);
        writeFileSync(join(temp, 'verify-feature.mjs'), `
import assert from 'node:assert/strict';
import http from 'node:http';
const index = ${index};
let calls = 0;
const server = http.createServer(async (req, res) => {
    calls++;
    const url = new URL(req.url, 'http://fixture.invalid');
    const expected = [
        ['GET', '/api/v1/api/proxies'], ['POST', '/api/v1/api/channel'],
        ['PUT', '/api/v1/api/channel/sample-channel'], ['DELETE', '/api/v1/api/channel/sample-channel'],
    ][index];
    assert.deepEqual([req.method, url.pathname], expected);
    assert.equal(req.headers['x-api-key'], 'test-only-api-key');
    let body = '';
    for await (const chunk of req) body += chunk;
    if (index === 0) {
        assert.equal(url.searchParams.get('channelId'), 'sample-channel');
        assert.equal(url.searchParams.get('count'), '1');
        assert.equal(url.searchParams.get('sessionDuration'), '10');
    } else if (index === 1 || index === 2) {
        const expectedBody = { name: index === 1 ? 'development' : 'development-updated', password: 'FixturePass9' };
        if (index === 1) Object.assign(expectedBody, { zoneName: 'sample-zone', type: 'residential' });
        assert.deepEqual(JSON.parse(body), expectedBody);
    }
    const data = index === 0 ? { proxies: ['http://fixture:fake@gateway.invalid:8000'], count: 1 }
        : index === 1 ? { channelId: 'sample-channel' } : true;
    res.writeHead(index === 1 ? 201 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ err: false, code: 200, data }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
Object.assign(process.env, {
    NSTDATA_API_TOKEN: 'test-only-api-key', NSTDATA_API_BASE_URL: 'http://127.0.0.1:' + server.address().port,
    NSTDATA_CHANNEL_ID: 'sample-channel', NSTDATA_CHANNEL_PASSWORD: 'FixturePass9', NSTDATA_ZONE_NAME: 'sample-zone',
});
try { await import('./feature.mjs'); assert.equal(calls, 1); }
finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
`);
        execFileSync(process.execPath, ['verify-feature.mjs'], { cwd: temp, env, timeout: 10000, stdio: 'inherit' });
    }
    console.log(`PASS: ${files.length} exact package files, empty-cache install, installed-client tests, declarations and bilingual quick start/four guide operations`);
} finally { rmSync(temp, { recursive: true, force: true }); }
