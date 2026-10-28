import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { codeBlocks, shellCommands } from './documentation.mjs';

const execute = promisify(execFile);
const listOperation = '    const channels = await client.listChannels({ page: 1, pageSize: 10 });\n' +
    '    console.log({ channelsOnPage: channels.length });';

export async function checkDocumentedCommands({ root, temp, archive, manifest, files, environment }) {
    const registryRequests = [];
    const archiveBytes = readFileSync(archive);
    const integrity = 'sha512-' + createHash('sha512').update(archiveBytes).digest('base64');
    const registry = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        registryRequests.push({ method: request.method, pathname, authorization: !!request.headers.authorization });
        if (request.method !== 'GET' || request.headers.authorization) {
            response.writeHead(403); response.end(); return;
        }
        if (pathname === '/' + manifest.name) {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ name: manifest.name, 'dist-tags': { latest: manifest.version },
                versions: { [manifest.version]: { ...manifest, dist: { integrity,
                    tarball: `http://127.0.0.1:${registry.address().port}/proxy.tgz` } } } }));
        } else if (pathname === '/proxy.tgz') response.end(archiveBytes);
        else { response.writeHead(404); response.end(); }
    });
    const requests = [];
    const channel = { channelId: 'sample-channel', password: 'FixturePass9', name: 'fixture' };
    let operation = 'list', mode = 'normal';
    const service = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        const body = [];
        for await (const chunk of request) body.push(chunk);
        requests.push({ method: request.method, path: url.pathname,
            query: Object.fromEntries(url.searchParams), body: Buffer.concat(body).toString() });
        assert.equal(request.headers['x-api-key'], 'fixture-api-key');
        const expected = {
            list: ['GET', '/api/v1/api/channels'], generate: ['GET', '/api/v1/api/proxies'],
            get: ['GET', '/api/v1/api/channel/sample-channel'], create: ['POST', '/api/v1/api/channel'],
            update: ['PUT', '/api/v1/api/channel/sample-channel'],
            delete: ['DELETE', '/api/v1/api/channel/sample-channel'],
        }[operation];
        assert.deepEqual([request.method, url.pathname], expected);
        if (operation === 'list') assert.deepEqual(Object.fromEntries(url.searchParams), {
            page: '1', pageSize: '10',
        });
        else if (operation === 'generate') assert.deepEqual(Object.fromEntries(url.searchParams), {
            channelId: 'sample-channel', country: 'US', protocol: 'http', sessionDuration: '10', count: '1',
        });
        if (['create', 'update'].includes(operation)) {
            const expectedBody = {
                name: operation === 'create' ? 'development' : 'development-updated', password: 'FixturePass9',
            };
            if (operation === 'create') Object.assign(expectedBody, { zoneName: 'sample-zone', type: 'residential' });
            assert.deepEqual(JSON.parse(Buffer.concat(body).toString()), expectedBody);
        } else assert.equal(body.length, 0);
        if (mode === 'http') { response.writeHead(503); response.end('fixture-private-body'); return; }
        let data;
        if (operation === 'list' || operation === 'get') data = mode === 'empty' ? [] : [channel];
        else if (operation === 'generate') data = mode === 'empty'
            ? { proxies: [], count: 0 }
            : { proxies: ['http://fixture:private-password@gateway.invalid:8000'], count: 1 };
        else data = operation === 'create' ? channel : mode !== 'false';
        response.writeHead(operation === 'create' ? 201 : 200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(mode === 'api'
            ? { code: 403, err: true, data: null, message: 'fixture-private-body' }
            : { code: 200, err: false, data }));
    });
    registry.listen(0, '127.0.0.1'); service.listen(0, '127.0.0.1');
    try {
        await Promise.all([once(registry, 'listening'), once(service, 'listening')]);
        const env = Object.fromEntries(Object.entries(environment)
            .filter(([key]) => !key.startsWith('NSTDATA_')));
        Object.assign(env, { npm_config_offline: 'false', NPM_CONFIG_OFFLINE: 'false',
            npm_config_registry: `http://127.0.0.1:${registry.address().port}`,
            NPM_CONFIG_REGISTRY: `http://127.0.0.1:${registry.address().port}` });
        let scenarios = 0, nativePrograms = 0, guideFragments = 0, commands = 0;
        for (const language of ['en', 'zh']) {
            const application = join(temp, 'documented-' + language); mkdirSync(application);
            writeFileSync(join(application, 'package.json'), '{"private":true,"type":"module"}\n');
            const localEnv = { ...env, npm_config_cache: join(application, 'cache'),
                NPM_CONFIG_CACHE: join(application, 'cache') };
            const readme = readFileSync(join(root, language === 'en' ? 'README.md' : 'README_zh.md'), 'utf8');
            const originalCommands = shellCommands(readme);
            assert.deepEqual(originalCommands, [
                ['npm', 'install', manifest.name], ['node', '--env-file=.env', 'quickstart.mjs'],
            ]);
            await execute(process.execPath, [process.env.npm_execpath, ...originalCommands[0].slice(1)], {
                cwd: application, env: localEnv, timeout: 30000,
            });
            commands++;
            const installed = join(application, 'node_modules', manifest.name);
            assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version, manifest.version);
            for (const file of files) assert.deepEqual(readFileSync(join(installed, file)),
                readFileSync(join(temp, 'node_modules', manifest.name, file)), file);
            const programBlocks = codeBlocks(readme).filter(block => block.lang === 'js');
            const settings = codeBlocks(readme).filter(block => block.lang === 'dotenv');
            assert.equal(programBlocks.length, 1); assert.equal(settings.length, 1);
            assert.equal(settings[0].text, 'NSTDATA_API_TOKEN=your-api-key');
            const program = programBlocks[0].text;
            assert.ok(program.includes(listOperation));
            writeFileSync(join(application, 'quickstart.mjs'), program);
            // Exercise the default API origin without adding test configuration to the examples.
            const networkFixture = join(application, 'api-fixture.cjs');
            writeFileSync(networkFixture, `const request = globalThis.fetch;
const origin = 'http://127.0.0.1:${service.address().port}';
globalThis.fetch = (input, options) => {
    const url = new URL(input);
    if (url.origin !== 'https://api.nstdata.io') throw new Error('Unexpected API origin');
    return request(new URL(url.pathname + url.search, origin), options);
};\n`);
            const programEnv = { ...localEnv,
                NODE_OPTIONS: (localEnv.NODE_OPTIONS ?? '') + ' --require=' + JSON.stringify(networkFixture),
                NSTDATA_API_BASE_URL: 'https://unused-setting.invalid',
            };
            const run = async (nextOperation, nextMode, filename, expected, errorCode) => {
                operation = nextOperation; mode = nextMode;
                const values = {
                    NSTDATA_API_TOKEN: 'fixture-api-key',
                    NSTDATA_CHANNEL_ID: 'sample-channel', NSTDATA_CHANNEL_PASSWORD: 'FixturePass9',
                    NSTDATA_ZONE_NAME: 'sample-zone',
                };
                if (mode === 'no-key') delete values.NSTDATA_API_TOKEN;
                if (mode === 'no-channel') delete values.NSTDATA_CHANNEL_ID;
                if (mode === 'no-password') delete values.NSTDATA_CHANNEL_PASSWORD;
                if (mode === 'no-zone') delete values.NSTDATA_ZONE_NAME;
                const dotenv = settings[0].text.replace('your-api-key', values.NSTDATA_API_TOKEN ?? '');
                const extra = Object.entries(values).filter(([key]) => key !== 'NSTDATA_API_TOKEN')
                    .map(([key, value]) => `${key}=${value}`).join('\n');
                writeFileSync(join(application, '.env'), dotenv + '\n' + extra + '\n', { mode: 0o600 });
                const before = requests.length;
                let result, exitCode = 0;
                try {
                    const args = originalCommands[1].slice(1)
                        .map(value => value === 'quickstart.mjs' ? filename : value);
                    result = await execute(process.execPath, args, {
                        cwd: application, env: programEnv, timeout: 10000,
                    });
                } catch (error) { result = error; exitCode = error.code; }
                assert.equal(exitCode, errorCode ? 1 : 0, result.stderr);
                const noRequest = mode.startsWith('no-');
                assert.equal(requests.length - before, noRequest ? 0 : 1);
                assert.doesNotMatch(result.stdout + result.stderr,
                    /fixture-api-key|FixturePass9|private-password|fixture-private-body|sample-channel/);
                if (errorCode) {
                    assert.equal(result.stdout, '');
                    assert.match(result.stderr, new RegExp(`code: '${errorCode}'`));
                    assert.doesNotMatch(result.stderr, /\n\s+at /);
                } else { assert.equal(result.stderr, ''); assert.equal(result.stdout.trim(), expected); }
                scenarios++; commands++;
            };
            for (const [variant, expected, errorCode] of [
                ['normal', '{ channelsOnPage: 1 }'], ['empty', '{ channelsOnPage: 0 }'],
                ['api', '', 'API_ERROR'], ['http', '', 'HTTP_ERROR'], ['no-key', '', 'INVALID_CONFIG'],
            ]) await run('list', variant, 'quickstart.mjs', expected, errorCode);
            nativePrograms++;
            const guide = readFileSync(join(root, 'docs', language === 'en' ? 'guide.md' : 'guide_zh.md'), 'utf8');
            assert.deepEqual(shellCommands(guide), [], 'Guide fragments must not claim standalone commands');
            const fragments = codeBlocks(guide).filter(block => block.lang === 'js');
            assert.equal(fragments.length, 5);
            const variants = [
                ['generate', [['normal', '{ count: 1 }'], ['empty', '{ count: 0 }'],
                    ['no-channel', '', 'INVALID_ARGUMENT']]],
                ['get', [['normal', '{ matchingChannels: 1 }'], ['empty', '{ matchingChannels: 0 }'],
                    ['no-channel', '', 'INVALID_ARGUMENT']]],
                ['create', [['normal', ''], ['no-password', '', 'INVALID_ARGUMENT'],
                    ['no-zone', '', 'INVALID_ARGUMENT'], ['api', '', 'API_ERROR']]],
                ['update', [['normal', '{ updated: true }'], ['false', '{ updated: false }'],
                    ['no-password', '', 'INVALID_ARGUMENT'], ['http', '', 'HTTP_ERROR']]],
                ['delete', [['normal', '{ deleted: true }'], ['false', '{ deleted: false }'],
                    ['no-channel', '', 'INVALID_ARGUMENT'], ['api', '', 'API_ERROR']]],
            ];
            for (const [index, fragment] of fragments.entries()) {
                const filename = 'operation-' + index + '.mjs';
                const code = fragment.text.split('\n').map(line => '    ' + line).join('\n');
                writeFileSync(join(application, filename), program.replace(listOperation, code));
                const [method, cases] = variants[index];
                for (const [variant, expected, errorCode] of cases) await run(method, variant, filename, expected, errorCode);
                guideFragments++;
            }
        }
        assert.ok(registryRequests.some(request => request.pathname === '/proxy.tgz'));
        for (const request of registryRequests) {
            assert.equal(request.method, 'GET'); assert.equal(request.authorization, false);
            assert.ok(['/' + manifest.name, '/proxy.tgz'].includes(request.pathname));
        }
        return { scenarios, nativePrograms, guideFragments, commands };
    } finally {
        await Promise.all([registry, service].map(server => new Promise(resolve => {
            server.close(resolve); server.closeAllConnections();
        })));
    }
}
