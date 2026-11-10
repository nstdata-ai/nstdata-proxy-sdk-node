#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { ProxyClient, ProxyAPIError } from './index.js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { access, lstat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';

const controller = new AbortController();

const help = `Usage: nstdata-proxy [options]

Generate proxy connections using your Nstdata API key and available balance.
No channel ID, product name or country is required for the default setup.

Options:
  --yes                   Accept default setup without interactive confirmation
  --dry-run               Show the resolved setup without creating a channel or session
  --channel <id>          Use an existing channel instead of finding or creating a default
  --type <type>           Choose a product type
  --zone <name>           Choose a product returned by the account catalog
  --country <code>        Require a supported country (default: US, then an available country)
  --protocol <http|socks5> Connection protocol (default: http)
  --duration <minutes>    Session duration (default: 10)
  --count <1-1000>        Number of connections (default: 1)
  --env <path>            Load an explicit environment file
  --json                  JSON output without interactive prompts
  --show-url              Include connection URLs and their credentials in output
  --output <path>         Save connections to a new JSON file (mode 0600)
  -h, --help              Show help without contacting the API

Environment:
  NSTDATA_API_TOKEN        Required API key; prompted with hidden input in interactive mode
  NSTDATA_TEAM_ID          Optional explicit account team context
  NSTDATA_API_BASE_URL     Advanced API origin override; defaults to the official API

Examples:
  nstdata-proxy
  nstdata-proxy --dry-run --json
  nstdata-proxy --yes --json --output proxies.json

The default setup may create a reusable nstdata-sdk-default channel.
Generating connections does not test them or buy a package. Proxy use is metered.
Exit codes: 0 success; 1 API/setup failure; 2 invalid input; 130 interrupted.`;

class InputError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

function apiDiagnostics(error) {
    const details = {};
    if (Number.isInteger(error.statusCode) && error.statusCode >= 100 && error.statusCode <= 599)
        details.statusCode = error.statusCode;
    if (Number.isSafeInteger(error.applicationCode)) details.applicationCode = error.applicationCode;
    if (error.code !== 'HTTP_ERROR' && error.code !== 'API_ERROR') return details;
    const status = error.code === 'API_ERROR' ? details.applicationCode : details.statusCode;
    if (status === 401) details.hint = 'Check NSTDATA_API_TOKEN and its account or team context.';
    else if (status === 403) details.hint = 'Check the API key permissions and account or team access.';
    else if (status === 429) details.hint = 'The API rate limit was reached. Wait before starting another command.';
    else if (status >= 500 && status <= 599) details.hint = 'The API returned a service error. Check its status before another command.';
    return details;
}

async function question(prompt, hidden = false) {
    const output = hidden ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stderr;
    const reader = createInterface({ input: process.stdin, output, terminal: true });
    reader.once('SIGINT', () => controller.abort());
    const closed = new Promise((_, reject) => reader.once('close', () => reject(new ProxyAPIError('ABORTED'))));
    try {
        const answer = reader.question('', { signal: controller.signal });
        process.stderr.write(prompt);
        return (await Promise.race([answer, closed])).trim();
    }
    finally { reader.close(); if (hidden) process.stderr.write('\n'); }
}

async function choose(label, rows, display) {
    if (!rows.length) throw new InputError('NO_OPTIONS', 'No compatible options are available.');
    process.stderr.write(label + '\n');
    rows.forEach((row, i) => process.stderr.write(`  ${i + 1}. ${display(row)}\n`));
    while (true) {
        const answer = await question('Choose a number [1], or q to cancel: ');
        if (answer.toLowerCase() === 'q') throw new ProxyAPIError('ABORTED');
        const index = answer ? Number(answer) - 1 : 0;
        if (Number.isInteger(index) && index >= 0 && index < rows.length) return rows[index];
        process.stderr.write('Choose a number from the displayed options.\n');
    }
}

async function advanced(client, input) {
    const source = await question('Use an existing channel [c], or choose a product [Enter]: ');
    if (source.toLowerCase() === 'q') throw new ProxyAPIError('ABORTED');
    if (source && source.toLowerCase() !== 'c')
        throw new InputError('INVALID_SELECTION', 'Press Enter to choose a product, or c for an existing channel.');
    if (source.toLowerCase() === 'c') {
        const rows = await client.listChannels({ status: 1, page: 1, pageSize: 100 }, { signal: controller.signal });
        const channel = await choose('Active channels (first page):', rows,
            row => `${row.channelId} (${row.type ?? 'unknown product'})`);
        return { country: input.country, protocol: input.protocol, sessionDuration: input.sessionDuration, channelId: channel.channelId };
    }
    const rows = (await client.listPlans({}, { signal: controller.signal }))
        .filter(row => row.protocols.includes(input.protocol ?? 'http') &&
            ['residential_lite', 'residential', 'ipv6', 'datacenter', 'mobile'].includes(row.type));
    const plan = await choose('Available products (reference price per GB):', rows,
        row => `${row.name} (${row.type}, ${row.priceGB}/GB)`);
    const countries = await client.listCountries({ type: plan.type }, { signal: controller.signal });
    const country = await choose('Available countries:', countries, row => row.value);
    return { protocol: input.protocol, sessionDuration: input.sessionDuration,
        type: plan.type, zoneName: plan.name, country: country.value };
}

async function checkOutput(path) {
    if (!path || /[\p{Cc}\p{Cf}]/u.test(path)) throw new InputError('OUTPUT_ERROR', 'Choose a new writable output file.');
    try {
        await lstat(path);
        throw new InputError('OUTPUT_EXISTS', 'Output already exists. Choose another path; existing files are never overwritten.');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            if (error instanceof InputError) throw error;
            throw new InputError('OUTPUT_ERROR', 'Cannot inspect the output path. Choose a new writable file.');
        }
    }
    try { await access(dirname(resolve(path)), constants.W_OK); }
    catch { throw new InputError('OUTPUT_ERROR', 'The output directory is not writable or does not exist.'); }
}

async function main() {
    const { values } = parseArgs({ options: {
        yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, channel: { type: 'string' },
        type: { type: 'string' }, zone: { type: 'string' }, country: { type: 'string' },
        protocol: { type: 'string' }, duration: { type: 'string' }, count: { type: 'string' },
        'env': { type: 'string' }, json: { type: 'boolean' }, 'show-url': { type: 'boolean' },
        output: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    }, strict: true });
    if (values.help) { console.log(help); return; }
    if (values['env'] !== undefined) {
        try { process.loadEnvFile(values['env']); }
        catch { throw new InputError('ENV_FILE_ERROR', 'Cannot read the specified environment file. Check its path and permissions.'); }
    }
    const count = values.count === undefined ? 1 : Number(values.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000)
        throw new InputError('INVALID_ARGUMENT', '--count must be an integer from 1 to 1000.');
    if ((values.output !== undefined && values['show-url']) || (values['dry-run'] && (values.output !== undefined || values['show-url'])))
        throw new InputError('INVALID_ARGUMENT', 'Choose one output mode; --dry-run cannot export connections.');
    const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY && !values.json && !values.yes);
    let apiKey = process.env.NSTDATA_API_TOKEN;
    if (!apiKey && interactive) apiKey = await question('Nstdata API key (hidden): ', true);
    if (!apiKey) throw new InputError('MISSING_API_KEY', 'Set NSTDATA_API_TOKEN or use --env; interactive input is hidden.');
    if (!interactive && !values.yes && !values['dry-run'])
        throw new InputError('CONFIRMATION_REQUIRED', 'Use --dry-run to inspect setup, or --yes to allow channel setup and generation.');
    if (values.output !== undefined) await checkOutput(values.output);
    const client = new ProxyClient({ apiKey, baseUrl: process.env.NSTDATA_API_BASE_URL, teamId: process.env.NSTDATA_TEAM_ID });
    apiKey = undefined;
    let input = { channelId: values.channel, type: values.type, zoneName: values.zone, country: values.country,
        protocol: values.protocol, sessionDuration: values.duration === undefined ? undefined : Number(values.duration) };
    const request = { signal: controller.signal };
    const interrupt = () => controller.abort();
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    try {
        let plan = await client.prepareProxy(input, request);
        if (values['dry-run']) { console.log(JSON.stringify(plan)); return; }
        while (interactive) {
            process.stderr.write(`\nProduct: ${plan.zoneName} (${plan.type})\nCountry: ${plan.country}\n` +
                `Reference price: ${plan.priceGB}/GB; balance: ${plan.balance}\n` +
                `Channel: ${plan.channelAction === 'create' ? 'create reusable SDK default' : 'reuse selected channel'}\n` +
                `Generate ${count} ${plan.protocol} connection(s); no network test or package purchase.\n`);
            const answer = (await question('[Enter] Continue, [a] Advanced settings, [q] Cancel: ')).toLowerCase();
            if (answer === 'q') throw new ProxyAPIError('ABORTED');
            if (answer === 'a') { input = await advanced(client, input); plan = await client.prepareProxy(input, request); continue; }
            if (answer !== '') {
                process.stderr.write('Press Enter, a for advanced settings, or q to cancel.\n');
                continue;
            }
            break;
        }
        const result = await client.getProxies({ ...input, count }, request);
        let output = values.output, show = Boolean(values['show-url']);
        while (interactive && !output && !show) {
            const answer = (await question('Generated. [s] Save private file, [v] Show credentials, [Enter] Summary only: ')).toLowerCase();
            if (answer === 's') {
                while (!output) {
                    const path = await question('New output file [proxies.json]: ') || 'proxies.json';
                    try { await checkOutput(path); output = path; }
                    catch (error) { if (!(error instanceof InputError)) throw error; process.stderr.write(error.message + '\n'); }
                }
            }
            else if (answer === 'v') show = true;
            else if (answer === '') break;
            else process.stderr.write('Choose s, v or Enter; the generated connections are retained.\n');
        }
        if (output) {
            try { await writeFile(output, JSON.stringify({ ...result, count }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
            catch { throw new InputError('OUTPUT_ERROR', 'Generation completed but connections could not be saved. Check the path before another run; no retry was made.'); }
        }
        const { proxies, ...metadata } = result;
        console.log(JSON.stringify({ ...metadata, count, ...(output ? { saved: true } : {}), ...(show ? { proxies } : {}) }));
    } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}

main().catch(error => {
    if (controller.signal.aborted && !(error instanceof ProxyAPIError)) error = new ProxyAPIError('ABORTED');
    const known = error instanceof InputError || error instanceof ProxyAPIError;
    console.error(JSON.stringify({ error: { code: known ? error.code : 'INVALID_INPUT',
        message: known ? error.message : 'Invalid command-line input. Run nstdata-proxy --help for usage.',
        ...(error instanceof ProxyAPIError ? apiDiagnostics(error) : {}) } }));
    process.exitCode = controller.signal.aborted || error.code === 'ABORTED' ? 130 : error instanceof ProxyAPIError ? 1 : 2;
});
