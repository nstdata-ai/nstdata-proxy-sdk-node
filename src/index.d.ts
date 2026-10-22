export type ProxyType = 'residential' | 'residential_lite' | 'ipv6' | 'datacenter' | 'mobile' | 'isp';
export type ProxyErrorCode = 'INVALID_CONFIG' | 'INVALID_ARGUMENT' | 'TIMEOUT' | 'ABORTED' |
    'NETWORK_ERROR' | 'HTTP_ERROR' | 'API_ERROR' | 'INVALID_RESPONSE' | 'RESPONSE_TOO_LARGE';

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
    generateProxies(input: GenerateProxiesInput, options?: RequestOptions): Promise<GeneratedProxies>;
    listChannels(query?: ListChannelsQuery, options?: RequestOptions): Promise<Channel[]>;
    getChannel(channelId: string, options?: RequestOptions): Promise<Channel[]>;
    createChannel(input: CreateChannelInput, options?: RequestOptions): Promise<Channel>;
    updateChannel(channelId: string, input: UpdateChannelInput, options?: RequestOptions): Promise<boolean>;
    deleteChannel(channelId: string, options?: RequestOptions): Promise<boolean>;
}
