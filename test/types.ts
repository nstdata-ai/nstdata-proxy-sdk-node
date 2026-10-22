import { ProxyClient, ProxyAPIError, type Channel, type GeneratedProxies } from '../src/index.js';

async function consumer() {
    const client = new ProxyClient({ apiKey: 'test-only-api-key', timeoutMs: 15000 });
    const options = { signal: new AbortController().signal };
    const list: Channel[] = await client.listChannels({ page: 1, pageSize: 10, createType: 'balance' }, options);
    const detail: Channel[] = await client.getChannel('sample-channel', options);
    const generated: GeneratedProxies = await client.generateProxies({
        channelId: 'sample-channel', country: 'US', protocol: 'http', sessionDuration: 10, count: 1,
    }, options);
    const channel: Channel = await client.createChannel({
        name: 'sample', password: 'SamplePass9', zoneName: 'sample-zone', type: 'residential',
    }, options);
    const updated: boolean = await client.updateChannel('sample-channel', { name: 'sample', password: 'SamplePass9' }, options);
    const deleted: boolean = await client.deleteChannel('sample-channel', options);
    // @ts-expect-error Ordinary customer updates require a password.
    void client.updateChannel('sample-channel', { name: 'sample' });
    // @ts-expect-error Channel detail preserves the API's array result.
    const single: Channel = await client.getChannel('sample-channel');
    // @ts-expect-error Unsupported generation protocol.
    void client.generateProxies({ channelId: 'sample', country: 'US', protocol: 'https', sessionDuration: 10, count: 1 });
    return { list, detail, generated, channel, updated, deleted, single };
}
const code: string = new ProxyAPIError('TIMEOUT').code;
void consumer; void code;
