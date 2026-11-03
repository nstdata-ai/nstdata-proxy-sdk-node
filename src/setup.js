import { ProxyAPIError } from './errors.js';
import { randomBytes } from 'node:crypto';

const channelName = 'nstdata-sdk-default';
const productTypes = ['residential_lite', 'residential', 'ipv6', 'datacenter', 'mobile', 'isp'];
const text = value => typeof value === 'string' && value.isWellFormed() && value === value.trim() &&
    value.length > 0 && value.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const uncertain = error => ['TIMEOUT', 'ABORTED', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'].includes(error.code) ||
    (error.code === 'HTTP_ERROR' && (error.statusCode === 408 || error.statusCode >= 500)) ||
    (error.code === 'API_ERROR' && error.applicationCode >= 500 && error.applicationCode < 600);

function normalize(input = {}, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['channelId', 'type', 'zoneName', 'country', 'protocol', 'sessionDuration'].includes(key)) ||
        !options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some(key => key !== 'signal') ||
        (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw new ProxyAPIError('INVALID_ARGUMENT');
    for (const key of ['channelId', 'zoneName', 'country'])
        if (input[key] !== undefined && !text(input[key])) throw new ProxyAPIError('INVALID_ARGUMENT');
    if (input.channelId !== undefined && (/[/?#\\]/.test(input.channelId) || ['.', '..'].includes(input.channelId)))
        throw new ProxyAPIError('INVALID_ARGUMENT');
    const { protocol = 'http', sessionDuration = 10 } = input;
    if (!['http', 'socks5'].includes(protocol) || !Number.isSafeInteger(sessionDuration) || sessionDuration < 1 ||
        (input.type !== undefined && !productTypes.includes(input.type))) throw new ProxyAPIError('INVALID_ARGUMENT');
    return { channelId: input.channelId, type: input.type, zoneName: input.zoneName,
        country: input.country?.toUpperCase(), protocol, sessionDuration };
}

function usable(channel) {
    if (channel.status !== 1 || !text(channel.channelId) || !productTypes.includes(channel.type) || !text(channel.zoneName)) return false;
    if (channel.exTime != null && (!Number.isFinite(Date.parse(channel.exTime)) || Date.parse(channel.exTime) <= Date.now())) return false;
    if (channel.total != null && (!Number.isFinite(channel.total) || !Number.isFinite(channel.used) || channel.total <= channel.used)) return false;
    return true;
}

async function sharedTask(tasks, key, task, signal) {
    if (signal?.aborted) throw new ProxyAPIError('ABORTED');
    let entry = tasks.get(key);
    if (!entry) {
        entry = { controller: new AbortController(), waiters: 0, settled: false };
        tasks.set(key, entry);
        entry.promise = Promise.resolve().then(() => task(entry.controller.signal)).finally(() => {
            entry.settled = true;
            if (tasks.get(key) === entry) tasks.delete(key);
        });
    }
    const wasAborted = entry.controller.signal.aborted;
    try {
        return await new Promise((resolve, reject) => {
            entry.waiters++;
            let done = false;
            const finish = (callback, value) => {
                if (done) return;
                done = true; signal?.removeEventListener('abort', aborted);
                entry.waiters--;
                if (!entry.waiters && !entry.settled) entry.controller.abort();
                callback(value);
            };
            const aborted = () => finish(reject, new ProxyAPIError('ABORTED'));
            signal?.addEventListener('abort', aborted, { once: true });
            entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
            if (signal?.aborted) aborted();
        });
    } catch (error) {
        // A new caller can wait out an earlier cancelled initialization before resolving its own setup.
        if (wasAborted && !signal?.aborted) return sharedTask(tasks, key, task, signal);
        throw error;
    }
}

export class ProxySetup {
    #client;
    #cache = new Map();
    #initializations = new Map();
    #creations = new Map();
    #uncertainCreations = new Set();
    constructor(client) { this.#client = client; }

    async prepare(input, options = {}) {
        const settings = normalize(input, options);
        if (options.signal?.aborted) throw new ProxyAPIError('ABORTED');
        const key = JSON.stringify(settings);
        const cached = this.#cache.get(key);
        if (cached && cached.until > Date.now()) return Object.freeze({ ...cached.plan });
        const request = { signal: options.signal };
        const account = await this.#client.getAccountInfo(request);
        if (!settings.channelId && account.balance <= 0) throw new ProxyAPIError('INSUFFICIENT_BALANCE');
        const catalog = await this.#client.listPlans({}, request);
        const compatible = catalog.filter(plan => productTypes.includes(plan.type) && plan.protocols.includes(settings.protocol) &&
            (settings.type === undefined ? (settings.channelId || ['residential_lite', 'residential'].includes(plan.type)) : plan.type === settings.type) &&
            (settings.zoneName === undefined || plan.name === settings.zoneName)).sort((a, b) =>
            productTypes.indexOf(a.type) - productTypes.indexOf(b.type) || a.priceGB - b.priceGB || compare(a.name, b.name));
        if (!compatible.length) throw new ProxyAPIError('NO_COMPATIBLE_PLAN');
        const channels = settings.channelId ? await this.#client.getChannel(settings.channelId, request) : await this.#defaultChannels(request);
        const active = channels.filter(channel => usable(channel) && compatible.some(plan =>
            plan.name === channel.zoneName && plan.type === channel.type) &&
            (settings.channelId || settings.country === undefined || !channel.country ||
                channel.country === 'ANY' || channel.country === settings.country) &&
            (settings.channelId ? channel.channelId === settings.channelId :
                channel.name === channelName && channel.total == null && !channel.packageId));
        active.sort((a, b) => compatible.findIndex(plan => plan.name === a.zoneName && plan.type === a.type) -
            compatible.findIndex(plan => plan.name === b.zoneName && plan.type === b.type) || compare(a.channelId, b.channelId));
        const channel = active[0];
        if (settings.channelId && !channel) throw new ProxyAPIError('CHANNEL_UNAVAILABLE');
        const plan = channel ? compatible.find(plan => plan.name === channel.zoneName && plan.type === channel.type) : compatible[0];
        if (!channel && plan.type === 'isp') throw new ProxyAPIError('CHANNEL_REQUIRED');
        if (account.balance <= 0 && !(channel?.total > channel?.used)) throw new ProxyAPIError('INSUFFICIENT_BALANCE');
        const available = await this.#client.listCountries({ type: plan.type }, request);
        const values = [...new Set(available.map(row => row.value).filter(text))].sort(compare);
        const fixed = channel?.country && channel.country !== 'ANY' ? channel.country : undefined;
        const country = settings.country ?? fixed ?? (values.includes('US') ? 'US' : values[0]);
        if (!country || !values.includes(country) || (fixed && fixed !== country)) throw new ProxyAPIError('COUNTRY_UNAVAILABLE');
        const result = Object.freeze({ channelId: channel?.channelId, channelAction: channel ? 'reuse' : 'create',
            channelName: channel?.name ?? channelName, type: plan.type, zoneName: plan.name, country,
            protocol: settings.protocol, sessionDuration: settings.sessionDuration, priceGB: plan.priceGB, balance: account.balance });
        this.#store(key, result);
        return Object.freeze({ ...result });
    }

    async get(input, options) {
        const { proxies, ...metadata } = await this.#generate(input, options, 1);
        return { ...metadata, url: proxies[0] };
    }

    async getMany(input = {}, options) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProxyAPIError('INVALID_ARGUMENT');
        const { count = 1, ...settings } = input;
        if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new ProxyAPIError('INVALID_ARGUMENT');
        return this.#generate(settings, options, count);
    }

    async #generate(input, options = {}, count) {
        const settings = normalize(input, options);
        if (options.signal?.aborted) throw new ProxyAPIError('ABORTED');
        const key = JSON.stringify(settings);
        const initialized = await sharedTask(this.#initializations, key,
            signal => this.#initialize(settings, key, signal), options.signal);
        if (options.signal?.aborted) throw new ProxyAPIError('ABORTED');
        let result;
        try {
            result = await this.#client.generateProxies({ channelId: initialized.plan.channelId,
                country: initialized.plan.country, protocol: settings.protocol,
                sessionDuration: settings.sessionDuration, count }, { signal: options.signal });
        } catch (error) {
            if (uncertain(error)) throw new ProxyAPIError('PROXY_GENERATION_UNCERTAIN', {
                statusCode: error.statusCode, applicationCode: error.applicationCode,
            });
            throw error;
        }
        if (!result.proxies.length) throw new ProxyAPIError('NO_PROXY_GENERATED');
        try {
            if (result.proxies.length !== count) throw new Error();
            for (const value of result.proxies) {
                if (value.length > 8192) throw new Error();
                const url = new URL(value);
                decodeURIComponent(url.username); decodeURIComponent(url.password);
                if (url.protocol !== settings.protocol + ':' || !url.hostname ||
                    !['', '/'].includes(url.pathname) || url.search || url.hash ||
                    /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error();
            }
        } catch { throw new ProxyAPIError('PROXY_GENERATION_UNCERTAIN'); }
        const { channelAction, channelName: _name, balance: _balance, ...metadata } = initialized.plan;
        return { ...metadata, proxies: result.proxies, createdChannel: initialized.createdChannel };
    }

    async #initialize(settings, key, signal) {
        let plan = await this.prepare(settings, { signal });
        let createdChannel = false;
        if (plan.channelAction === 'create') {
            const channel = await sharedTask(this.#creations, plan.type + ':' + plan.zoneName,
                active => this.#createDefault(plan, active), signal);
            plan = Object.freeze({ ...plan, channelId: channel.channelId, channelAction: 'reuse' });
            this.#store(key, plan);
            createdChannel = channel.created;
        }
        return { plan, createdChannel };
    }

    async #createDefault(plan, signal) {
        const resource = plan.type + ':' + plan.zoneName;
        const channels = await this.#defaultChannels({ signal });
        const existing = channels.filter(channel => usable(channel) && channel.name === channelName &&
            channel.type === plan.type && channel.zoneName === plan.zoneName && channel.total == null && !channel.packageId &&
            (!channel.country || channel.country === 'ANY')).sort((a, b) => compare(a.channelId, b.channelId))[0];
        if (existing) {
            this.#uncertainCreations.delete(resource);
            return { channelId: existing.channelId, created: false };
        }
        if (this.#uncertainCreations.has(resource) || this.#uncertainCreations.size >= 16)
            throw new ProxyAPIError('CHANNEL_CREATION_UNCERTAIN');
        if (signal.aborted) throw new ProxyAPIError('ABORTED');
        try {
            const channel = await this.#client.createChannel({ name: channelName,
                password: randomBytes(12).toString('hex'), type: plan.type, zoneName: plan.zoneName }, { signal });
            if (!text(channel.channelId) || /[/?#\\]/.test(channel.channelId) || ['.', '..'].includes(channel.channelId))
                throw new ProxyAPIError('INVALID_RESPONSE');
            this.#uncertainCreations.delete(resource);
            return { channelId: channel.channelId, created: true };
        } catch (error) {
            if (uncertain(error)) {
                this.#uncertainCreations.add(resource);
                for (const [key, entry] of this.#cache)
                    if (entry.plan.type === plan.type && entry.plan.zoneName === plan.zoneName) this.#cache.delete(key);
                throw new ProxyAPIError('CHANNEL_CREATION_UNCERTAIN', {
                    statusCode: error.statusCode, applicationCode: error.applicationCode,
                });
            }
            throw error;
        }
    }

    #store(key, plan) {
        if (!this.#cache.has(key) && this.#cache.size >= 16) this.#cache.delete(this.#cache.keys().next().value);
        this.#cache.set(key, { plan, until: Date.now() + 30000 });
    }

    async #defaultChannels(options) {
        const rows = [], seen = new Set();
        for (let page = 1; page <= 5; page++) {
            // Match names locally: the customer route does not translate s/createType into channel filters.
            const batch = await this.#client.listChannels({ status: 1, page, pageSize: 100 }, options);
            for (const channel of batch) {
                if (seen.has(channel.channelId)) throw new ProxyAPIError('CHANNEL_DISCOVERY_LIMIT');
                seen.add(channel.channelId); rows.push(channel);
            }
            if (batch.length < 100) return rows;
        }
        throw new ProxyAPIError('CHANNEL_DISCOVERY_LIMIT');
    }
}
