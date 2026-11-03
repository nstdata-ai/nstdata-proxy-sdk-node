export type ProxyType = 'residential' | 'residential_lite' | 'ipv6' | 'datacenter' | 'mobile' | 'isp';
export type ProxyErrorCode = 'INVALID_CONFIG' | 'INVALID_ARGUMENT' | 'TIMEOUT' | 'ABORTED' |
    'NETWORK_ERROR' | 'HTTP_ERROR' | 'API_ERROR' | 'INVALID_RESPONSE' | 'RESPONSE_TOO_LARGE' |
    'INSUFFICIENT_BALANCE' | 'NO_COMPATIBLE_PLAN' | 'CHANNEL_UNAVAILABLE' | 'CHANNEL_REQUIRED' |
    'COUNTRY_UNAVAILABLE' | 'CHANNEL_DISCOVERY_LIMIT' | 'CHANNEL_CREATION_UNCERTAIN' |
    'PROXY_GENERATION_UNCERTAIN' | 'NO_PROXY_GENERATED';

export class ProxyAPIError extends Error {
    readonly code: ProxyErrorCode;
    readonly statusCode?: number;
    readonly applicationCode?: number;
    constructor(code: ProxyErrorCode, details?: { statusCode?: number; applicationCode?: number });
}

export interface ProxyClientConfig {
    apiKey: string;
    baseUrl?: string;
    teamId?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
}
export interface RequestOptions { signal?: AbortSignal }
export interface AccountInfo {
    balance: number;
    email?: string;
    referralBalance?: number;
    [key: string]: unknown;
}
export interface ProxyPlan {
    name: string;
    type: string;
    protocols: string[];
    priceGB: number;
    supports: string[];
    label?: string;
    [key: string]: unknown;
}
export interface ProxyCountry {
    value: string;
    label?: string;
    regionId?: string | number;
    [key: string]: unknown;
}
export interface ProxySetupInput {
    channelId?: string;
    type?: ProxyType;
    zoneName?: string;
    country?: string;
    protocol?: 'http' | 'socks5';
    sessionDuration?: number;
}
export interface ProxyPreparation {
    channelId?: string;
    channelAction: 'create' | 'reuse';
    channelName: string;
    type: ProxyType;
    zoneName: string;
    country: string;
    protocol: 'http' | 'socks5';
    sessionDuration: number;
    priceGB: number;
    balance: number;
}
export interface ProxyConnection extends Omit<ProxyPreparation, 'channelId' | 'channelAction' | 'channelName' | 'balance'> {
    channelId: string;
    url: string;
    createdChannel: boolean;
}
export interface ProxyConnections extends Omit<ProxyConnection, 'url'> { proxies: string[] }
export interface GenerateProxiesInput {
    channelId: string;
    country: string;
    protocol: 'http' | 'socks5';
    sessionDuration: number;
    count: number;
    state?: string;
    city?: string;
    asn?: number;
    sense?: string;
    gateway?: string;
}
export interface GeneratedProxies {
    proxies: string[];
    count: number;
    [key: string]: unknown;
}
export interface Channel {
    channelId: string;
    name?: string | null;
    password?: string | null;
    zoneName?: string | null;
    type?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    [key: string]: unknown;
}
export interface ListChannelsQuery {
    page?: number;
    pageSize?: number;
    type?: ProxyType;
    regionType?: 'country' | 'state' | 'city';
    status?: 0 | 1 | 2 | 3 | 4;
    createType?: 'package' | 'balance';
    s?: string;
}
export interface UpdateChannelInput {
    name: string;
    password: string;
    limit?: number;
    country?: string;
    state?: string;
    city?: string;
    whitelist?: string[];
    senses?: string[];
}
export interface CreateChannelInput extends UpdateChannelInput {
    zoneName: string;
    type: ProxyType;
}

export class ProxyClient {
    constructor(config: ProxyClientConfig);
    getAccountInfo(options?: RequestOptions): Promise<AccountInfo>;
    listPlans(query?: { type?: ProxyType }, options?: RequestOptions): Promise<ProxyPlan[]>;
    listCountries(query: { type: ProxyType }, options?: RequestOptions): Promise<ProxyCountry[]>;
    prepareProxy(input?: ProxySetupInput, options?: RequestOptions): Promise<Readonly<ProxyPreparation>>;
    getProxy(input?: ProxySetupInput, options?: RequestOptions): Promise<ProxyConnection>;
    getProxies(input?: ProxySetupInput & { count?: number }, options?: RequestOptions): Promise<ProxyConnections>;
    generateProxies(input: GenerateProxiesInput, options?: RequestOptions): Promise<GeneratedProxies>;
    listChannels(query?: ListChannelsQuery, options?: RequestOptions): Promise<Channel[]>;
    getChannel(channelId: string, options?: RequestOptions): Promise<Channel[]>;
    createChannel(input: CreateChannelInput, options?: RequestOptions): Promise<Channel>;
    updateChannel(channelId: string, input: UpdateChannelInput, options?: RequestOptions): Promise<boolean>;
    deleteChannel(channelId: string, options?: RequestOptions): Promise<boolean>;
}
