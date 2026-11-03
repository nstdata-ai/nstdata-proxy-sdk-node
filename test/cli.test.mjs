import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, key } from './proxy-fixture.mjs';

const cliFile = process.env.NSTDATA_PROXY_INSTALLED === '1'
    ? fileURLToPath(new URL('./cli.js', import.meta.resolve('@nstdata-ai/proxy')))
    : fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function cli(args, env = {}, input = '') {
    const clean = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'NODE_OPTIONS'].filter(name => process.env[name])
        .map(name => [name, process.env[name]]));
    const child = spawn(process.execPath, [cliFile, ...args], { env: { ...clean, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.stdin.end(input);
    const [code] = await once(child, 'close');
    return { code, stdout, stderr };
}

test('CLI help works without credentials, a project or any account operation', async () => {
    const result = await cli(['--help']);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /Usage: nstdata-proxy/);
    assert.match(result.stdout, /NSTDATA_API_TOKEN/);
    assert.match(result.stdout, /--yes/);
    assert.ok(result.stdout.split('\n').every(line => line.length <= 100));
});

test('non-interactive CLI requires credentials and explicit consent before any API request', async t => {
    const f = await fixture(t);
    const missing = await cli(['--yes'], { NSTDATA_API_BASE_URL: f.baseUrl });
    assert.equal(missing.code, 2); assert.equal(JSON.parse(missing.stderr).error.code, 'MISSING_API_KEY');
    const unconfirmed = await cli([], { NSTDATA_API_TOKEN: key, NSTDATA_API_BASE_URL: f.baseUrl });
    assert.equal(unconfirmed.code, 2);
    assert.equal(JSON.parse(unconfirmed.stderr).error.code, 'CONFIRMATION_REQUIRED');
    assert.equal(f.state.requests.length, 0);
});

test('CLI previews are read-only and confirmed generation hides credentials by default', async t => {
    const f = await fixture(t);
    const env = { NSTDATA_API_TOKEN: key, NSTDATA_API_BASE_URL: f.baseUrl };
    const preview = await cli(['--dry-run', '--json'], env);
    assert.equal(preview.code, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).channelAction, 'create');
    assert.equal(f.state.channels.length, 0);
    assert.ok(f.state.requests.every(row => row.method === 'GET' && !row.path.endsWith('/proxies')));
    const generated = await cli(['--yes', '--json', '--count', '2'], env);
    assert.equal(generated.code, 0, generated.stderr);
    assert.equal(JSON.parse(generated.stdout).count, 2);
    assert.equal(generated.stderr, '');
    assert.doesNotMatch(generated.stdout, /quickstart-test-key|fixture:password|gateway.invalid/);
    assert.equal(f.state.channels.length, 1);
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 1);
});

test('connection export is explicit, private, non-overwriting and separate from API-key storage', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'nstdata-proxy-cli-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const f = await fixture(t);
    const file = join(dir, 'connections.json');
    const env = { NSTDATA_API_TOKEN: key, NSTDATA_API_BASE_URL: f.baseUrl };
    const saved = await cli(['--yes', '--json', '--output', file], env);
    assert.equal(saved.code, 0, saved.stderr);
    const output = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(output.proxies[0], 'http://fixture:password@gateway.invalid:8000');
    assert.doesNotMatch(JSON.stringify(output), /quickstart-test-key/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const before = f.state.requests.length;
    const existing = await cli(['--yes', '--output', file], env);
    assert.equal(existing.code, 2);
    assert.equal(f.state.requests.length, before);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), output);
    const shown = await cli(['--yes', '--show-url', '--json'], env);
    assert.equal(shown.code, 0);
    assert.equal(JSON.parse(shown.stdout).proxies[0], output.proxies[0]);
});

test('CLI loads only an explicit env file and reports input errors without their contents', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'nstdata-proxy-env-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const f = await fixture(t);
    const file = join(dir, '.env');
    await writeFile(file, `NSTDATA_API_TOKEN=${key}\nNSTDATA_API_BASE_URL=${f.baseUrl}\n`, { mode: 0o600 });
    assert.equal((await cli(['--env', file, '--dry-run', '--json'])).code, 0);
    for (const args of [['--count', '0'], ['--unknown-secret-option'], ['--env', '/missing/private-path']]) {
        const result = await cli(args);
        assert.equal(result.code, 2);
        assert.equal(result.stdout, '');
        assert.doesNotMatch(result.stderr, /quickstart-test-key|unknown-secret-option|private-path/);
    }
});

test('hidden-key prompt is printed only after terminal input is in raw mode', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'nstdata-proxy-prompt-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const preload = join(dir, 'terminal.cjs');
    await writeFile(preload, `let raw = false;
Object.defineProperty(process.stdin, 'isTTY', { value: true });
Object.defineProperty(process.stderr, 'isTTY', { value: true });
process.stdin.setRawMode = value => { raw = value; return process.stdin; };
const write = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
    if (String(chunk).includes('Nstdata API key (hidden): ')) {
        if (!raw) process.stdout.write('PROMPT_BEFORE_RAW_MODE');
        setImmediate(() => process.stdin.emit('data', Buffer.from('\\x03')));
    }
    return write(chunk, ...args);
};\n`);
    const options = (process.env.NODE_OPTIONS ?? '') + ' --require=' + JSON.stringify(preload);
    const result = await cli([], { NODE_OPTIONS: options });
    assert.equal(result.code, 130, result.stderr);
    assert.doesNotMatch(result.stdout, /PROMPT_BEFORE_RAW_MODE/);
    assert.match(result.stderr, /ABORTED/);
});
