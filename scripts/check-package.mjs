import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep, posix, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkMarkdown, shellCommands } from './documentation.mjs';
import { checkDocumentedCommands } from './check-documentation.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
assert.ok(process.env.npm_execpath, 'Run npm run check:package');
const temp = mkdtempSync(join(tmpdir(), 'nstdata-proxy-package-'));
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
writeFileSync(join(temp, 'user.npmrc'), '');
writeFileSync(join(temp, 'global.npmrc'), '');
Object.assign(env, { PATH: dirname(process.execPath) + delimiter + env.PATH, npm_execpath: process.env.npm_execpath,
    npm_config_userconfig: join(temp, 'user.npmrc'), npm_config_globalconfig: join(temp, 'global.npmrc'),
    npm_config_cache: join(temp, 'cache'), npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false', npm_config_fund: 'false', npm_config_fetch_retries: '0', npm_config_update_notifier: 'false' });
const npm = (args, cwd) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, env, encoding: 'utf8', timeout: 30000,
});
try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    assert.equal(manifest.name, '@nstdata-ai/proxy');
    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].version, manifest.version);
    assert.equal(lock.packages[''].name, manifest.name);
    assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.peerDependencies ?? {}, {});
    assert.deepEqual(lock.packages[''].dependencies ?? {}, {});
    assert.equal(manifest.repository?.url, 'git+https://github.com/nstdata-ai/nstdata-proxy-sdk-node.git');
    assert.deepEqual(manifest.publishConfig, { access: 'public', registry: 'https://registry.npmjs.org' });
    for (const [name, entry] of Object.entries(lock.packages)) if (name) {
        assert.equal(entry.dev, true);
        assert.ok(entry.resolved.startsWith('https://registry.npmjs.org/'));
        assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
    }
    assert.doesNotMatch(JSON.stringify(lock), /file:|_planning|\/Users\//);
    for (const file of ['README.md', 'README_zh.md']) {
        assert.deepEqual(shellCommands(readFileSync(join(root, file), 'utf8'))[0], ['npm', 'install', manifest.name]);
    }
    assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n').includes(`## ${manifest.version}`));
    const files = ['package.json', 'src/index.js', 'src/index.d.ts', 'README.md', 'README_zh.md', 'LICENSE',
        'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/guide.md', 'docs/guide_zh.md'].sort();
    let archive;
    if (process.argv[2]) archive = resolve(process.argv[2]);
    else {
        const [pack] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root));
        assert.equal(pack.name, manifest.name); assert.equal(pack.version, manifest.version);
        archive = join(temp, pack.filename);
    }
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', timeout: 10000 }).trim().split('\n');
    const types = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', timeout: 10000 }).trim().split('\n');
    assert.ok(types.every(line => line.startsWith('-')), 'Archive must contain only regular files');
    assert.deepEqual(entries.sort(), files.map(file => 'package/' + file).sort());
    assert.equal(manifest.exports['.'].types, './src/index.d.ts');
    assert.equal(manifest.exports['.'].import, './src/index.js');
    for (const file of files) {
        const bytes = readFileSync(join(root, file));
        assert.deepEqual(execFileSync('tar', ['-xOzf', archive, 'package/' + file], { timeout: 10000 }), bytes, file);
        const text = bytes.toString('utf8');
        assert.doesNotMatch(text, /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bnpm_[a-zA-Z0-9]{30,}\b|\bgh[pousr]_[a-zA-Z0-9]{20,}\b|\/Users\/|_planning\//);
        if (!file.endsWith('.md')) continue;
        checkMarkdown(text, file);
        for (const [, target] of text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
            if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) continue;
            const [relative, anchor] = target.split('#');
            const linked = posix.normalize(posix.join(posix.dirname(file), relative || posix.basename(file)));
            assert.ok(files.includes(linked), `Unpackaged documentation link: ${file} -> ${target}`);
            if (anchor) {
                const slugs = [...readFileSync(join(root, linked), 'utf8').matchAll(/^#+ (.+)$/gm)].map(match =>
                    match[1].toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replaceAll(' ', '-'));
                assert.ok(slugs.includes(decodeURIComponent(anchor)), `Missing documentation anchor: ${target}`);
            }
        }
    }
    writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}\n');
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], temp);
    const installed = join(temp, 'node_modules/@nstdata-ai/proxy');
    const installedLock = JSON.parse(readFileSync(join(temp, 'node_modules/.package-lock.json'), 'utf8'));
    assert.deepEqual(Object.keys(installedLock.packages), ['node_modules/@nstdata-ai/proxy']);
    const installedFiles = readdirSync(installed, { recursive: true })
        .filter(name => statSync(join(installed, name)).isFile()).map(name => name.split(sep).join('/'));
    assert.deepEqual(installedFiles.sort(), files);
    for (const file of files) assert.deepEqual(readFileSync(join(installed, file)), readFileSync(join(root, file)), file);
    const guard = join(temp, 'loopback-only.cjs');
    writeFileSync(guard, `const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof options === 'object' ? options.host : args[1];
    if (host !== '127.0.0.1') throw Object.assign(new Error('Offline checks allow loopback only'), { code: 'DOCS_NETWORK_BLOCKED' });
    return Reflect.apply(connect, this, args);
};\n`);
    const testEnv = { ...env, NODE_OPTIONS: `--require=${JSON.stringify(guard)}` };
    mkdirSync(join(temp, 'test'));
    copyFileSync(join(root, 'test/client.test.mjs'), join(temp, 'test/client.test.mjs'));
    execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'test/client.test.mjs'], {
        cwd: temp, env: { ...testEnv, NSTDATA_PROXY_INSTALLED: '1' }, timeout: 30000, stdio: 'inherit',
    });
    writeFileSync(join(temp, 'consumer.mts'), readFileSync(join(root, 'test/types.ts'), 'utf8').replace('../src/index.js', '@nstdata-ai/proxy'));
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022', 'consumer.mts'], {
        cwd: temp, env, timeout: 20000, stdio: 'inherit',
    });
    const documented = await checkDocumentedCommands({ root, temp, archive, manifest, files, environment: testEnv });
    console.log(`PASS: ${manifest.name}@${manifest.version}; ${files.length} exact files; empty-cache install; installed-client tests and declarations; documented commands ${JSON.stringify(documented)}`);
} finally { rmSync(temp, { recursive: true, force: true }); }
