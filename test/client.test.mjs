import assert from 'node:assert/strict';
import http from 'node:http';
import { inspect } from 'node:util';
import test from 'node:test';

const { ProxyClient, ProxyAPIError } = await import(process.env.NSTDATA_PROXY_INSTALLED === '1'
    ? '@nstdata-ai/proxy' : '../src/index.js');
const key = 'test-only-api-key';
const generation = { channelId: 'sample-channel', country: 'US', protocol: 'http', sessionDuration: 10, count: 2 };
const edit = { name: 'sample', password: 'SamplePass9' };
const created = { ...edit, zoneName: 'sample-zone', type: 'residential' };
function json(res, data, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data, err: false, code: 200, msg: 'SUCCESS' }));
}
async function fixture(t, handler) {
    const requests = [];
    const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return { baseUrl, requests, client: new ProxyClient({ apiKey: key, baseUrl }) };
}
const errorCode = code => error => error instanceof ProxyAPIError && error.code === code;

test('all six methods use customer routes and preserve their result shapes', async t => {
    const results = [
        { proxies: ['http://user:pass@gateway.invalid:8000', 'socks5://user:pass@gateway.invalid:8000'], count: 2 },
        [{ channelId: 'sample-channel', password: 'SamplePass9', futureField: { enabled: true } }],
        [], { channelId: 'new-channel', ...created }, true, false,
    ];
    let index = 0;
    const f = await fixture(t, (_req, res) => json(res, results[index], index++ === 3 ? 201 : 200));
    const client = new ProxyClient({ apiKey: key, baseUrl: f.baseUrl, teamId: 'sample-team' });
    assert.deepEqual(await client.generateProxies(generation), results[0]);
    assert.deepEqual(await client.listChannels({ page: 2, pageSize: 10, s: 'a & b' }), results[1]);
    assert.deepEqual(await client.getChannel('unknown-channel'), []);
    assert.deepEqual(await client.createChannel(created), results[3]);
    assert.equal(await client.updateChannel('sample-channel', edit), true);
    assert.equal(await client.deleteChannel('sample-channel'), false);
    assert.deepEqual(f.requests.map(r => [r.method, r.url.split('?')[0]]), [
        ['GET', '/api/v1/api/proxies'], ['GET', '/api/v1/api/channels'],
        ['GET', '/api/v1/api/channel/unknown-channel'], ['POST', '/api/v1/api/channel'],
        ['PUT', '/api/v1/api/channel/sample-channel'], ['DELETE', '/api/v1/api/channel/sample-channel'],
    ]);
    assert.equal(new URL(f.requests[1].url, f.baseUrl).searchParams.get('s'), 'a & b');
    assert.deepEqual(JSON.parse(f.requests[3].body), created);
    assert.deepEqual(JSON.parse(f.requests[4].body), edit);
    for (const r of f.requests) {
        assert.equal(r.headers['x-api-key'], key);
        assert.equal(r.headers['x-team-id'], 'sample-team');
        assert.equal(r.headers.authorization, undefined);
        assert.equal(r.headers.cookie, undefined);
        assert.ok(!r.url.includes(key));
    }
});

test('empty channel lists remain arrays without invented pagination metadata', async t => {
    const f = await fixture(t, (_req, res) => json(res, []));
    assert.deepEqual(await f.client.listChannels(), []);
    assert.deepEqual(await f.client.getChannel('absent'), []);
    assert.equal(f.requests.length, 2);
});

test('configuration validates authority, origin and bounds without exposing inputs', async t => {
    let index = 0;
    for (const config of [undefined, {}, { apiKey: '' }, { apiKey: 'bad\nkey' },
        { apiKey: 'nst_svc_sample' }, { apiKey: 'nst_cb_sample' },
        { apiKey: key, baseUrl: 'http://remote.invalid' }, { apiKey: key, baseUrl: 'https://u:p@api.invalid' },
        { apiKey: key, baseUrl: 'https://api.invalid/path' }, { apiKey: key, baseUrl: 'https://api.invalid/?token=value' },
        { apiKey: key, baseUrl: 'https://api.invalid/#fragment' }, { apiKey: key, timeoutMs: 0 },
        { apiKey: key, timeoutMs: 2 ** 31 }, { apiKey: key, maxResponseBytes: -1 },
        { apiKey: key, teamId: 'bad\r\nteam' }, { apiKey: key, unexpected: true }, { apiKey: key, baseUrl: null },
        { apiKey: '非请求头字符' }, { apiKey: key, baseUrl: 'https://api.\ninvalid' }]) {
        await t.test(`invalid configuration ${++index}`, () => {
            assert.throws(() => new ProxyClient(config), errorCode('INVALID_CONFIG'));
        });
    }
    assert.doesNotMatch(inspect(new ProxyClient({ apiKey: key })), /test-only-api-key/);
});

test('invalid arguments never submit requests', async t => {
    const f = await fixture(t, (_req, res) => json(res, []));
    const calls = [
        () => f.client.generateProxies(null),
        () => f.client.generateProxies({ ...generation, count: 0 }),
        () => f.client.generateProxies({ ...generation, count: 1001 }),
        () => f.client.generateProxies({ ...generation, count: 1.5 }),
        () => f.client.generateProxies({ ...generation, protocol: 'https' }),
        () => f.client.generateProxies({ ...generation, city: 'miami' }),
        () => f.client.generateProxies({ ...generation, sessionDuration: 0 }),
        () => f.client.generateProxies({ ...generation, u: true }),
        () => f.client.listChannels({ page: 0 }),
        () => f.client.listChannels({ pageSize: 101 }),
        () => f.client.listChannels({ status: 5 }),
        () => f.client.listChannels({ sortBy: 'ignored' }),
        () => f.client.listChannels({ createType: 'unknown' }),
        () => f.client.getChannel('../proxies'),
        () => f.client.getChannel('%2e%2e/'),
        () => f.client.getChannel(''),
        () => f.client.getChannel('\ud800'),
        () => f.client.createChannel({ ...created, limit: 0 }),
        () => f.client.createChannel({ ...created, type: 'unknown' }),
        () => f.client.updateChannel('sample', { password: 'SamplePass9' }),
        () => f.client.updateChannel('sample', { name: 'sample' }),
        () => f.client.updateChannel('sample', { ...edit, whitelist: ['::1'] }),
        () => f.client.updateChannel('sample', { ...edit, whitelist: Array(1) }),
        () => f.client.updateChannel('sample', { ...edit, token: 'not-an-input' }),
        () => f.client.listChannels({}, { signal: {} }),
    ];
    for (let i = 0; i < calls.length; i++) await t.test(`invalid input ${i + 1}`, () => assert.rejects(calls[i](), errorCode('INVALID_ARGUMENT')));
    assert.equal(f.requests.length, 0);
});

test('non-ASCII identifiers are encoded as one path segment', async t => {
    const f = await fixture(t, (_req, res) => json(res, []));
    await f.client.getChannel('渠道 1');
    assert.equal(f.requests[0].url, '/api/v1/api/channel/%E6%B8%A0%E9%81%93%201');
});

test('HTTP errors are sanitized and every method is attempted only once', async t => {
    const f = await fixture(t, (_req, res) => { res.writeHead(503); res.end(`sensitive ${key} SamplePass9`); });
    for (const call of [() => f.client.generateProxies(generation), () => f.client.createChannel(created),
        () => f.client.updateChannel('sample', edit), () => f.client.deleteChannel('sample')]) {
        await assert.rejects(call(), error => {
            assert.equal(error.code, 'HTTP_ERROR');
            assert.equal(error.statusCode, 503);
            assert.doesNotMatch(inspect(error), /test-only-api-key|SamplePass9|sensitive/);
            assert.equal(error.cause, undefined);
            return true;
        });
    }
    assert.equal(f.requests.length, 4);
});

test('redirects never forward API credentials to another origin', async t => {
    const destination = await fixture(t, (_req, res) => json(res, []));
    const origin = await fixture(t, (_req, res) => { res.writeHead(302, { location: `${destination.baseUrl}/capture` }); res.end(); });
    await assert.rejects(origin.client.listChannels(), error => error.code === 'HTTP_ERROR' && error.statusCode === 302);
    assert.equal(origin.requests.length, 1);
    assert.equal(destination.requests.length, 0);
});

test('malformed envelopes and method result shapes are rejected', async t => {
    const responses = [null, [], { data: [], code: 200 }, { data: [], err: false },
        { data: [], err: 'false', code: 200 }, { data: {}, err: false, code: 200 },
        { data: [null], err: false, code: 200 }, { data: [{}], err: false, code: 200 },
        { data: [{ channelId: 'sample', password: 123 }], err: false, code: 200 }];
    let index = 0;
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify(responses[index++])));
    for (const _ of responses) await assert.rejects(f.client.listChannels(), errorCode('INVALID_RESPONSE'));
    assert.equal(index, responses.length);
});

test('application error code is available without untrusted server message', async t => {
    const f = await fixture(t, (_req, res) => res.end(JSON.stringify({ err: true, code: 9001, msg: key })));
    await assert.rejects(f.client.listChannels(), error => error.code === 'API_ERROR' &&
        error.statusCode === 200 && error.applicationCode === 9001 && !inspect(error).includes(key));
});

test('generation count and boolean mutation results must match their schemas', async t => {
    const results = [{ proxies: ['http://sample.invalid'], count: 2 }, { proxies: [''], count: 1 },
        { proxies: [], count: 0 }, { success: true }, 'true', { channelId: 'sample' }];
    let index = 0;
    const f = await fixture(t, (_req, res) => json(res, results[index++]));
    await assert.rejects(f.client.generateProxies(generation), errorCode('INVALID_RESPONSE'));
    await assert.rejects(f.client.generateProxies(generation), errorCode('INVALID_RESPONSE'));
    assert.deepEqual(await f.client.generateProxies(generation), { proxies: [], count: 0 });
    await assert.rejects(f.client.updateChannel('sample', edit), errorCode('INVALID_RESPONSE'));
    await assert.rejects(f.client.deleteChannel('sample'), errorCode('INVALID_RESPONSE'));
    assert.deepEqual(await f.client.createChannel(created), { channelId: 'sample' });
});

test('response limits count UTF-8 bytes, including chunked bodies', async t => {
    const body = JSON.stringify({ data: [{ channelId: 'sample', text: '中文'.repeat(30) }], err: false, code: 200 });
    for (const advertised of [true, false]) {
        const f = await fixture(t, (_req, res) => {
            if (advertised) res.setHeader('content-length', Buffer.byteLength(body));
            res.write(body.slice(0, 20)); res.end(body.slice(20));
        });
        const client = new ProxyClient({ apiKey: key, baseUrl: f.baseUrl, maxResponseBytes: 128 });
        await assert.rejects(client.listChannels(), errorCode('RESPONSE_TOO_LARGE'));
        assert.equal(f.requests.length, 1);
    }
});

test('exact byte limit passes and invalid JSON/UTF-8 does not', async t => {
    const bytes = Buffer.from('{"data":[],"err":false,"code":200}');
    const f = await fixture(t, (_req, res) => res.end(bytes));
    assert.deepEqual(await new ProxyClient({ apiKey: key, baseUrl: f.baseUrl, maxResponseBytes: bytes.length }).listChannels(), []);
    const invalid = await fixture(t, (_req, res) => res.end('not JSON'));
    await assert.rejects(invalid.client.listChannels(), errorCode('INVALID_RESPONSE'));
    const utf8 = await fixture(t, (_req, res) => res.end(Buffer.concat([
        Buffer.from('{"data":[{"channelId":"'), Buffer.from([0xff]), Buffer.from('"}],"err":false,"code":200}'),
    ])));
    await assert.rejects(utf8.client.listChannels(), errorCode('INVALID_RESPONSE'));
});

test('timeout covers response headers and streaming body without retries', async t => {
    for (const stage of ['headers', 'body']) {
        const f = await fixture(t, (_req, res) => {
            if (stage === 'body') { res.writeHead(200); res.write('{"data":'); }
        });
        const client = new ProxyClient({ apiKey: key, baseUrl: f.baseUrl, timeoutMs: 150 });
        await assert.rejects(client.listChannels(), errorCode('TIMEOUT'));
        assert.equal(f.requests.length, 1);
    }
});

test('cancellation before and during a request never leaks its reason', async t => {
    const f = await fixture(t, () => {});
    const before = new AbortController(); before.abort(new Error(key));
    await assert.rejects(f.client.listChannels({}, { signal: before.signal }), errorCode('ABORTED'));
    assert.equal(f.requests.length, 0);
    const during = new AbortController();
    const operation = f.client.listChannels({}, { signal: during.signal });
    while (!f.requests.length) await new Promise(resolve => setTimeout(resolve, 5));
    during.abort(new Error(key));
    await assert.rejects(operation, error => error.code === 'ABORTED' && !inspect(error).includes(key));
    assert.equal(f.requests.length, 1);
});

test('closed connections return a sanitized network error without retry', async t => {
    const f = await fixture(t, (req, _res) => req.socket.destroy());
    await assert.rejects(f.client.createChannel(created), errorCode('NETWORK_ERROR'));
    assert.equal(f.requests.length, 1);
});

test('cancellation while reading the body stops local waiting', async t => {
    let started;
    const bodyStarted = new Promise(resolve => { started = resolve; });
    const f = await fixture(t, (_req, res) => { res.writeHead(200); res.write('{"data":'); started(); });
    const controller = new AbortController();
    const operation = f.client.listChannels({}, { signal: controller.signal });
    await bodyStarted;
    controller.abort();
    await assert.rejects(operation, errorCode('ABORTED'));
    assert.equal(f.requests.length, 1);
});

test('optional fields and empty editable lists are serialized without invented defaults', async t => {
    const results = [{ proxies: [], count: 0 }, true];
    let index = 0;
    const f = await fixture(t, (_req, res) => json(res, results[index++]));
    await f.client.generateProxies({ ...generation, protocol: 'socks5', state: 'FL', city: 'miami', asn: 1359, sense: 'sample', gateway: 'sample-gateway' });
    const query = new URL(f.requests[0].url, f.baseUrl).searchParams;
    assert.equal(query.get('protocol'), 'socks5');
    assert.equal(query.get('asn'), '1359');
    assert.equal(query.get('sessionDuration'), '10');
    assert.equal(query.has('u'), false);
    assert.equal(f.requests[0].headers['x-team-id'], undefined);
    await f.client.updateChannel('sample-channel', { ...edit, whitelist: [], senses: [] });
    assert.deepEqual(JSON.parse(f.requests[1].body), { ...edit, whitelist: [], senses: [] });
});
