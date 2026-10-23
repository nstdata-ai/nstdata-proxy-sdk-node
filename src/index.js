import { isIP } from 'node:net';

const types = ['residential', 'residential_lite', 'ipv6', 'datacenter', 'mobile', 'isp'];
const regions = ['country', 'state', 'city'];
const messages = {
    INVALID_CONFIG: 'Invalid Proxy client configuration.',
    INVALID_ARGUMENT: 'Invalid Proxy request arguments.',
    TIMEOUT: 'Proxy API request timed out; a submitted operation may still complete.',
    ABORTED: 'Local waiting was cancelled; a submitted operation may still complete.',
    NETWORK_ERROR: 'Proxy API connection failed; a submitted operation may still complete.',
    HTTP_ERROR: 'Proxy API returned an unsuccessful HTTP status.',
    API_ERROR: 'Proxy API reported an application error.',
    INVALID_RESPONSE: 'Proxy API returned an invalid response.',
    RESPONSE_TOO_LARGE: 'Proxy API response exceeded the configured byte limit.',
};

export class ProxyAPIError extends Error {
    constructor(code, { statusCode, applicationCode } = {}) {
        super(messages[code] ?? messages.INVALID_RESPONSE);
        this.name = 'ProxyAPIError';
        this.code = code;
        if (statusCode !== undefined) this.statusCode = statusCode;
        if (applicationCode !== undefined) this.applicationCode = applicationCode;
    }
}

function fail(code = 'INVALID_ARGUMENT') { throw new ProxyAPIError(code); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, code = 'INVALID_ARGUMENT') {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(code);
}
function text(value) {
    return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value);
}
function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && value >= min && value <= max;
}
function strings(value) { return Array.isArray(value) && Array.from(value).every(text); }
function identifier(value) {
    if (!text(value) || value !== value.trim() || /[/?#\\]/.test(value) || value === '.' || value === '..') fail();
    try { return encodeURIComponent(value); }
    catch { fail(); }
}
function channelInput(input, create) {
    const allowed = ['name', 'password', 'limit', 'country', 'state', 'city', 'whitelist', 'senses'];
    if (create) allowed.push('zoneName', 'type');
    fields(input, allowed);
    if (!text(input.name) || input.name.length > 40 ||
        typeof input.password !== 'string' || !/^[A-Za-z0-9]{8,}$/.test(input.password)) fail();
    if (create && (!text(input.zoneName) || !types.includes(input.type))) fail();
    if (input.limit !== undefined && !integer(input.limit)) fail();
    for (const key of ['country', 'state', 'city']) if (input[key] !== undefined && !text(input[key])) fail();
    if (input.whitelist !== undefined && (!Array.isArray(input.whitelist) ||
        !Array.from(input.whitelist).every(ip => typeof ip === 'string' && isIP(ip) === 4))) fail();
    if (input.senses !== undefined && !strings(input.senses)) fail();
    return input;
}
function channel(value) {
    if (!object(value) || !text(value.channelId)) return false;
    for (const key of ['name', 'password', 'zoneName', 'type', 'country', 'state', 'city']) {
        if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') return false;
    }
    return true;
}
const channelList = value => Array.isArray(value) && value.every(channel);

export class ProxyClient {
    #apiKey;
    #baseUrl;
    #teamId;
    #timeoutMs;
    #maxResponseBytes;

    constructor(config) {
        fields(config, ['apiKey', 'baseUrl', 'teamId', 'timeoutMs', 'maxResponseBytes'], 'INVALID_CONFIG');
        const { apiKey, teamId, timeoutMs = 30000, maxResponseBytes = 1048576 } = config;
        if (!text(apiKey) || /\s/.test(apiKey) || /^(nst_svc_|nst_cb_)/.test(apiKey) ||
            (teamId !== undefined && (!text(teamId) || /\s/.test(teamId))) ||
            (config.baseUrl !== undefined && !text(config.baseUrl)) ||
            !integer(timeoutMs, 1, 2147483647) || !integer(maxResponseBytes)) fail('INVALID_CONFIG');
        try { new Headers({ 'x-api-key': apiKey, ...(teamId === undefined ? {} : { 'x-team-id': teamId }) }); }
        catch { fail('INVALID_CONFIG'); }
        let url;
        try { url = new URL(config.baseUrl ?? 'https://api.nstdata.io'); }
        catch { fail('INVALID_CONFIG'); }
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
            url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('INVALID_CONFIG');
        this.#apiKey = apiKey;
        this.#baseUrl = url.origin;
        this.#teamId = teamId;
        this.#timeoutMs = timeoutMs;
        this.#maxResponseBytes = maxResponseBytes;
    }

    async generateProxies(input, options) {
        fields(input, ['channelId', 'country', 'protocol', 'sessionDuration', 'count', 'state', 'city', 'asn', 'sense', 'gateway']);
        identifier(input.channelId);
        if (!text(input.country) || !['http', 'socks5'].includes(input.protocol) ||
            !integer(input.sessionDuration) || !integer(input.count, 1, 1000)) fail();
        for (const key of ['state', 'city', 'sense', 'gateway']) if (input[key] !== undefined && !text(input[key])) fail();
        if (input.city !== undefined && input.state === undefined) fail();
        if (input.asn !== undefined && !integer(input.asn)) fail();
        return this.#request('GET', '/proxies', input, undefined, options, value =>
            object(value) && Array.isArray(value.proxies) && value.proxies.every(text) &&
            integer(value.count, 0) && value.count === value.proxies.length);
    }

    async listChannels(query = {}, options) {
        fields(query, ['page', 'pageSize', 'type', 'regionType', 'status', 'createType', 's']);
        if (query.page !== undefined && !integer(query.page)) fail();
        if (query.pageSize !== undefined && !integer(query.pageSize, 1, 100)) fail();
        if (query.type !== undefined && !types.includes(query.type)) fail();
        if (query.regionType !== undefined && !regions.includes(query.regionType)) fail();
        if (query.status !== undefined && !integer(query.status, 0, 4)) fail();
        if (query.createType !== undefined && !['package', 'balance'].includes(query.createType)) fail();
        if (query.s !== undefined && !text(query.s)) fail();
        return this.#request('GET', '/channels', query, undefined, options, channelList);
    }

    async getChannel(channelId, options) {
        return this.#request('GET', `/channel/${identifier(channelId)}`, undefined, undefined, options, channelList);
    }

    async createChannel(input, options) {
        return this.#request('POST', '/channel', undefined, channelInput(input, true), options, channel);
    }

    async updateChannel(channelId, input, options) {
        return this.#request('PUT', `/channel/${identifier(channelId)}`, undefined, channelInput(input, false), options,
            value => typeof value === 'boolean');
    }

    async deleteChannel(channelId, options) {
        return this.#request('DELETE', `/channel/${identifier(channelId)}`, undefined, undefined, options,
            value => typeof value === 'boolean');
    }

    async #request(method, path, query, body, options = {}, valid) {
        fields(options, ['signal']);
        if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) fail();
        if (options.signal?.aborted) fail('ABORTED');
        const timeout = new AbortController();
        const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
        const timer = setTimeout(() => timeout.abort(), this.#timeoutMs);
        const url = new URL(`/api/v1/api${path}`, this.#baseUrl);
        for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
        const headers = { accept: 'application/json', 'x-api-key': this.#apiKey };
        if (this.#teamId !== undefined) headers['x-team-id'] = this.#teamId;
        if (body !== undefined) headers['content-type'] = 'application/json';
        let response;
        try {
            response = await fetch(url, {
                method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal,
                redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
            });
            if (!response.ok) throw new ProxyAPIError('HTTP_ERROR', { statusCode: response.status });
            if (Number(response.headers.get('content-length')) > this.#maxResponseBytes) fail('RESPONSE_TOO_LARGE');
            if (!response.body) fail('INVALID_RESPONSE');
            const chunks = [];
            let bytes = 0;
            for await (const chunk of response.body) {
                bytes += chunk.byteLength;
                if (bytes > this.#maxResponseBytes) fail('RESPONSE_TOO_LARGE');
                chunks.push(Buffer.from(chunk));
            }
            let envelope;
            try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
            catch { fail('INVALID_RESPONSE'); }
            if (!object(envelope) || typeof envelope.err !== 'boolean' || !Number.isFinite(envelope.code)) fail('INVALID_RESPONSE');
            if (envelope.err || envelope.code !== 200) {
                throw new ProxyAPIError('API_ERROR', { statusCode: response.status, applicationCode: envelope.code });
            }
            if (!valid(envelope.data)) fail('INVALID_RESPONSE');
            return envelope.data;
        } catch (error) {
            if (signal.aborted) fail(signal.reason === timeout.signal.reason ? 'TIMEOUT' : 'ABORTED');
            if (error instanceof ProxyAPIError) throw error;
            fail('NETWORK_ERROR');
        } finally {
            clearTimeout(timer);
            // Stop any unread response after an HTTP, size or parsing failure.
            if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
        }
    }
}
