import http from 'node:http';
const { ProxyClient } = await import(process.env.NSTDATA_PROXY_INSTALLED === '1'
    ? '@nstdata-ai/proxy' : '../src/index.js');
export const key = 'quickstart-test-key';
export const plans = [
    { name: 'prime', type: 'residential', protocols: ['http', 'socks5'], priceGB: 5, supports: ['country'] },
    { name: 'lite', type: 'residential_lite', protocols: ['http', 'socks5'], priceGB: 2, supports: ['country'] },
];
export const countries = [{ value: 'GB', label: 'United Kingdom' }, { value: 'US', label: 'United States' }];

export async function fixture(t, overrides = {}) {
    const state = { balance: 20, plans, countries, channels: [], requests: [], ...overrides };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        let body = ''; for await (const chunk of req) body += chunk;
        state.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
            body: body ? JSON.parse(body) : undefined, team: req.headers['x-team-id'] });
        if (state.handle && await state.handle(req, res, url, body, state)) return;
        let data;
        if (url.pathname.endsWith('/user/info')) data = { balance: state.balance };
        else if (url.pathname.endsWith('/plan/info')) data = state.plans;
        else if (url.pathname.endsWith('/region/country')) data = state.countries;
        else if (url.pathname.endsWith('/channels')) {
            const selectors = [...url.searchParams].filter(([name]) => !['page', 'pageSize'].includes(name));
            const rows = state.channels.filter(row => selectors.every(([name, value]) => String(row[name]) === value));
            const offset = (Number(url.searchParams.get('page') ?? 1) - 1) * Number(url.searchParams.get('pageSize') ?? 50);
            data = rows.slice(offset, offset + Number(url.searchParams.get('pageSize') ?? 50));
        }
        else if (url.pathname.endsWith('/channel') && req.method === 'POST') {
            const input = JSON.parse(body);
            data = { ...input, channelId: 'sdk-channel', status: 1, used: 0 };
            state.channels.push(data);
        } else if (url.pathname.includes('/channel/')) data = state.channels.filter(row =>
            row.channelId === decodeURIComponent(url.pathname.split('/').at(-1)));
        else if (url.pathname.endsWith('/proxies')) {
            const count = Number(url.searchParams.get('count'));
            data = { proxies: Array.from({ length: count }, (_, i) =>
                `${url.searchParams.get('protocol')}://fixture:password@gateway.invalid:${8000 + i}`), count };
        }
        else { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data, err: false, code: 200 }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return { state, baseUrl, client: new ProxyClient({ apiKey: key, baseUrl }) };
}
