import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';
import { fixture, key, plans, countries } from './proxy-fixture.mjs';

const { ProxyClient, ProxyAPIError } = await import(process.env.NSTDATA_PROXY_INSTALLED === '1'
    ? '@nstdata-ai/proxy' : '../src/index.js');
test('account lookup exposes a validated balance without changing account resources', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.client.getAccountInfo(), { balance: 20 });
    f.state.balance = -1;
    assert.deepEqual(await f.client.getAccountInfo(), { balance: -1 });
    for (const balance of [null, '20']) {
        f.state.balance = balance;
        await assert.rejects(f.client.getAccountInfo(), { code: 'INVALID_RESPONSE' });
    }
    assert.ok(f.state.requests.every(row => row.method === 'GET' && row.path.endsWith('/user/info')));
});

test('catalog queries preserve live products and country values and validate inputs before traffic', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.client.listPlans({ type: 'residential_lite' }), plans);
    assert.deepEqual(await f.client.listCountries({ type: 'residential_lite' }), countries);
    assert.equal(f.state.requests[0].query.type, 'residential_lite');
    assert.equal(f.state.requests[1].query.type, 'residential_lite');
    for (const call of [() => f.client.listPlans({ token: key }), () => f.client.listCountries(),
        () => f.client.listCountries({ type: 'not-a-type' })])
        await assert.rejects(call(), { code: 'INVALID_ARGUMENT' });
    assert.equal(f.state.requests.length, 2);
    f.state.plans = [{ ...plans[0], priceGB: 'unknown' }];
    await assert.rejects(f.client.listPlans(), { code: 'INVALID_RESPONSE' });
    f.state.countries = [{ label: 'Missing value' }];
    await assert.rejects(f.client.listCountries({ type: 'residential' }), { code: 'INVALID_RESPONSE' });
});

test('preparing a proxy with only a key selects live defaults without creating resources', async t => {
    const f = await fixture(t);
    const plan = await f.client.prepareProxy();
    assert.equal(plan.type, 'residential_lite');
    assert.equal(plan.zoneName, 'lite');
    assert.equal(plan.country, 'US');
    assert.equal(plan.protocol, 'http');
    assert.equal(plan.sessionDuration, 10);
    assert.equal(plan.channelAction, 'create');
    assert.equal(plan.channelId, undefined);
    assert.equal(plan.priceGB, 2);
    assert.equal(f.state.channels.length, 0);
    assert.ok(f.state.requests.every(row => row.method === 'GET' && !row.path.endsWith('/proxies')));
    assert.doesNotMatch(inspect(plan), /quickstart-test-key|password/);
});

test('a key-only user can generate one connection and reuse the confirmed default channel', async t => {
    const f = await fixture(t);
    const first = await f.client.getProxy();
    const second = await f.client.getProxy();
    assert.equal(first.url, 'http://fixture:password@gateway.invalid:8000');
    assert.equal(first.channelId, 'sdk-channel');
    assert.equal(first.createdChannel, true);
    assert.equal(second.createdChannel, false);
    const writes = f.state.requests.filter(row => row.method === 'POST');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.name, 'nstdata-sdk-default');
    assert.match(writes[0].body.password, /^[a-zA-Z0-9]{24}$/);
    assert.equal(writes[0].body.zoneName, 'lite');
    assert.equal(writes[0].body.type, 'residential_lite');
    const generations = f.state.requests.filter(row => row.path.endsWith('/proxies'));
    assert.equal(generations.length, 2);
    for (const row of generations) assert.deepEqual(row.query, {
        channelId: 'sdk-channel', country: 'US', protocol: 'http', sessionDuration: '10', count: '1',
    });
});

test('existing defaults are reused without touching business channels or credentials', async t => {
    const own = { channelId: 'existing', name: 'nstdata-sdk-default', type: 'residential_lite', zoneName: 'lite', status: 1 };
    const f = await fixture(t, { channels: [{ ...own, name: 'production', channelId: 'business' }, own] });
    assert.equal((await f.client.getProxy()).channelId, 'existing');
    assert.equal(f.state.requests.filter(row => row.method !== 'GET').length, 0);
    assert.deepEqual(f.state.channels, [{ ...own, name: 'production', channelId: 'business' }, own]);
});

test('a fresh client rediscovers the default without unsupported search or creation-type filters', async t => {
    const f = await fixture(t);
    const first = await f.client.getProxy();
    const second = await new ProxyClient({ apiKey: key, baseUrl: f.baseUrl }).getProxy();
    assert.equal(second.channelId, first.channelId);
    assert.equal(second.createdChannel, false);
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 2);
    for (const row of f.state.requests.filter(row => row.path.endsWith('/channels')))
        assert.deepEqual(Object.keys(row.query).sort(), ['page', 'pageSize', 'status']);
});

test('unsupported prerequisites stop before creating or generating anything', async t => {
    for (const [changes, code] of [[{ balance: 0 }, 'INSUFFICIENT_BALANCE'], [{ plans: [] }, 'NO_COMPATIBLE_PLAN'],
        [{ countries: [] }, 'COUNTRY_UNAVAILABLE']]) {
        const f = await fixture(t, changes);
        await assert.rejects(f.client.getProxy(), { code });
        assert.ok(f.state.requests.every(row => row.method === 'GET' && !row.path.endsWith('/proxies')));
    }
});

test('explicit choices are respected and incompatible selections never trigger fallback creation', async t => {
    const f = await fixture(t);
    const selected = await f.client.getProxy({ country: 'gb', type: 'residential', sessionDuration: 5 });
    assert.equal(selected.country, 'GB'); assert.equal(selected.zoneName, 'prime');
    assert.equal(f.state.requests.find(row => row.path.endsWith('/proxies')).query.sessionDuration, '5');
    const before = f.state.requests.length;
    await assert.rejects(f.client.getProxy({ channelId: 'absent' }), { code: 'CHANNEL_UNAVAILABLE' });
    await assert.rejects(f.client.getProxy({ country: 'ZZ' }), { code: 'COUNTRY_UNAVAILABLE' });
    assert.ok(f.state.requests.slice(before).every(row => row.method === 'GET' && !row.path.endsWith('/proxies')));
    for (const input of [{ unknown: true }, { country: '' }, { channelId: '../secret' }, { sessionDuration: 0 }, { protocol: 'https' }]) {
        const count = f.state.requests.length;
        await assert.rejects(f.client.getProxy(input), { code: 'INVALID_ARGUMENT' });
        assert.equal(f.state.requests.length, count);
    }
});

test('a fixed-region default is not reused for another requested region', async t => {
    const f = await fixture(t, { channels: [{ channelId: 'fixed', name: 'nstdata-sdk-default',
        type: 'residential_lite', zoneName: 'lite', status: 1, country: 'GB' }] });
    const proxy = await f.client.getProxy({ country: 'US' });
    assert.equal(proxy.country, 'US'); assert.notEqual(proxy.channelId, 'fixed');
    assert.equal(f.state.channels[0].country, 'GB');
});

test('concurrent callers share channel initialization but get separate generated sessions', async t => {
    const f = await fixture(t);
    const results = await Promise.all([f.client.getProxy(), f.client.getProxy(), f.client.getProxy()]);
    assert.ok(results.every(result => result.channelId === 'sdk-channel'));
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 3);
});

test('cancelling one waiter does not cancel another caller or generate the cancelled session', async t => {
    let started, release;
    const received = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const f = await fixture(t, { handle: async (req, _res, url) => {
        if (req.method === 'POST' && url.pathname.endsWith('/channel')) { started(); await gate; }
        return false;
    } });
    const controller = new AbortController();
    const first = f.client.getProxy({}, { signal: controller.signal });
    const second = f.client.getProxy();
    const rejected = assert.rejects(first, { code: 'ABORTED' });
    await received; controller.abort(); release();
    await rejected;
    assert.equal((await second).channelId, 'sdk-channel');
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 1);
});

test('unknown channel creation is reconciled by reads and is never blindly resubmitted', async t => {
    const f = await fixture(t, { handle: async (req, res, url) => {
        if (req.method === 'POST' && url.pathname.endsWith('/channel')) { res.destroy(); return true; }
        return false;
    } });
    await assert.rejects(f.client.getProxy(), error => {
        assert.equal(error.code, 'CHANNEL_CREATION_UNCERTAIN');
        assert.doesNotMatch(inspect(error), /quickstart-test-key|password|cause/);
        return true;
    });
    await assert.rejects(f.client.getProxy(), { code: 'CHANNEL_CREATION_UNCERTAIN' });
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
    f.state.channels.push({ channelId: 'recovered', name: 'nstdata-sdk-default', status: 1,
        type: 'residential_lite', zoneName: 'lite' });
    assert.equal((await f.client.getProxy()).channelId, 'recovered');
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
});

test('a batch uses one generation request and shares initialization with single-connection calls', async t => {
    const f = await fixture(t);
    const result = await f.client.getProxies({ count: 3 });
    assert.equal(result.proxies.length, 3);
    assert.equal(result.channelId, 'sdk-channel');
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 1);
    assert.equal(f.state.requests.find(row => row.path.endsWith('/proxies')).query.count, '3');
    await f.client.getProxy();
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
    for (const count of [0, 1001, 1.5]) await assert.rejects(f.client.getProxies({ count }), { code: 'INVALID_ARGUMENT' });
});

test('channel discovery is bounded and cannot convert an incomplete search into a creation', async t => {
    const f = await fixture(t, { handle: async (_req, res, url) => {
        if (!url.pathname.endsWith('/channels')) return false;
        const page = Number(url.searchParams.get('page'));
        res.end(JSON.stringify({ err: false, code: 200, data: Array.from({ length: 100 }, (_, i) =>
            ({ channelId: `other-${page}-${i}`, name: 'business' })) }));
        return true;
    } });
    await assert.rejects(f.client.getProxy(), { code: 'CHANNEL_DISCOVERY_LIMIT' });
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/channels')).length, 5);
    assert.equal(f.state.requests.filter(row => row.method !== 'GET' || row.path.endsWith('/proxies')).length, 0);
});

test('expired, banned and exhausted channels are not silently used as selected resources', async t => {
    for (const change of [{ status: 3 }, { exTime: '2000-01-01T00:00:00Z' }, { total: 100, used: 100 }]) {
        const f = await fixture(t, { channels: [{ channelId: 'selected', status: 1, type: 'residential',
            zoneName: 'prime', name: 'business', ...change }] });
        await assert.rejects(f.client.getProxy({ channelId: 'selected' }), { code: 'CHANNEL_UNAVAILABLE' });
        assert.ok(f.state.requests.every(row => row.method === 'GET' && !row.path.endsWith('/proxies')));
    }
});

test('generation errors, empty results and invalid connection URLs are not retried or exposed', async t => {
    for (const mode of ['unavailable', 'empty', 'invalid']) {
        const f = await fixture(t, { handle: async (_req, res, url) => {
            if (!url.pathname.endsWith('/proxies')) return false;
            if (mode === 'unavailable') { res.writeHead(503); res.end(key); }
            else res.end(JSON.stringify({ err: false, code: 200,
                data: mode === 'empty' ? { proxies: [], count: 0 } : { proxies: ['socks5://secret:secret@gateway.invalid:8000'], count: 1 } }));
            return true;
        } });
        await assert.rejects(f.client.getProxy(), error => {
            assert.ok(error instanceof ProxyAPIError);
            assert.equal(error.code, mode === 'empty' ? 'NO_PROXY_GENERATED' : 'PROXY_GENERATION_UNCERTAIN');
            assert.doesNotMatch(inspect(error), /quickstart-test-key|secret|cause/);
            return true;
        });
        assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 1);
    }
});

test('cancelled callers do not start discovery or resource requests', async t => {
    const f = await fixture(t);
    const signal = AbortSignal.abort();
    await assert.rejects(f.client.getProxy({}, { signal }), { code: 'ABORTED' });
    await assert.rejects(f.client.prepareProxy({}, { signal }), { code: 'ABORTED' });
    assert.equal(f.state.requests.length, 0);
});

test('concurrent country selections share one unrestricted default channel', async t => {
    const f = await fixture(t);
    const results = await Promise.all([f.client.getProxy({ country: 'US' }), f.client.getProxy({ country: 'GB' })]);
    assert.deepEqual(results.map(row => row.country), ['US', 'GB']);
    assert.equal(new Set(results.map(row => row.channelId)).size, 1);
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
});

test('SOCKS5 connections remain usable without adding a synthetic URL path', async t => {
    const f = await fixture(t);
    const result = await f.client.getProxy({ protocol: 'socks5' });
    assert.equal(result.url, 'socks5://fixture:password@gateway.invalid:8000');
    assert.equal(result.protocol, 'socks5');
    assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length, 1);
});

test('new query methods reject malformed declared optional fields instead of contradicting their types', async t => {
    for (const [path, data, call] of [
        ['/user/info', { balance: 20, email: 42 }, client => client.getAccountInfo()],
        ['/user/info', { balance: 20, referralBalance: '10' }, client => client.getAccountInfo()],
        ['/plan/info', [{ ...plans[0], label: {} }], client => client.listPlans()],
        ['/region/country', [{ value: 'US', label: 1 }], client => client.listCountries({ type: 'residential' })],
        ['/region/country', [{ value: 'US', regionId: {} }], client => client.listCountries({ type: 'residential' })],
    ]) {
        const f = await fixture(t, { handle: async (_req, res, url) => {
            if (!url.pathname.endsWith(path)) return false;
            res.end(JSON.stringify({ err: false, code: 200, data })); return true;
        } });
        await assert.rejects(call(f.client), { code: 'INVALID_RESPONSE' });
        assert.equal(f.state.requests.length, 1);
    }
});

test('server failures preserve unknown write outcomes without resubmission', async t => {
    for (const operation of ['create', 'generate']) {
        for (const failure of ['application', 'http-timeout']) {
            const f = await fixture(t, { handle: async (req, res, url) => {
                if (operation === 'create' ? req.method !== 'POST' : !url.pathname.endsWith('/proxies')) return false;
                if (failure === 'http-timeout') res.writeHead(408);
                res.end(JSON.stringify({ err: true, code: 500, data: null })); return true;
            } });
            const code = operation === 'create' ? 'CHANNEL_CREATION_UNCERTAIN' : 'PROXY_GENERATION_UNCERTAIN';
            await assert.rejects(f.client.getProxy(), error => {
                assert.equal(error.code, code);
                assert.equal(error.statusCode, failure === 'application' ? 200 : 408);
                assert.equal(error.applicationCode, failure === 'application' ? 500 : undefined);
                return true;
            });
            if (operation === 'create') await assert.rejects(f.client.getProxy(), { code });
            assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 1);
            assert.equal(f.state.requests.filter(row => row.path.endsWith('/proxies')).length,
                operation === 'generate' ? 1 : 0);
        }
    }
});

test('separate team clients retain their own initialization, cache and request context', async t => {
    const channels = new Map();
    const f = await fixture(t, { handle: async (req, res, url, body) => {
        const team = req.headers['x-team-id'];
        let data;
        if (url.pathname.endsWith('/channels')) data = channels.get(team) ?? [];
        else if (req.method === 'POST' && url.pathname.endsWith('/channel')) {
            data = { ...JSON.parse(body), channelId: team + '-channel', status: 1 };
            channels.set(team, [data]);
        } else {
            if (url.pathname.endsWith('/proxies')) assert.equal(url.searchParams.get('channelId'), team + '-channel');
            return false;
        }
        res.end(JSON.stringify({ err: false, code: 200, data })); return true;
    } });
    const clients = ['team-one', 'team-two'].map(teamId => new ProxyClient({ apiKey: key, baseUrl: f.baseUrl, teamId }));
    const result = await Promise.all(clients.map(client => client.getProxy()));
    assert.deepEqual(result.map(row => row.channelId), ['team-one-channel', 'team-two-channel']);
    assert.equal((await clients[0].getProxy()).channelId, 'team-one-channel');
    assert.equal(f.state.requests.filter(row => row.method === 'POST').length, 2);
    assert.ok(f.state.requests.every(row => ['team-one', 'team-two'].includes(row.team)));
});
