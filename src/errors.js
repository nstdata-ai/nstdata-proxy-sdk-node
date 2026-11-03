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
    INSUFFICIENT_BALANCE: 'No usable balance is available in this account context. Check the balance and API key context.',
    NO_COMPATIBLE_PLAN: 'No compatible proxy product is available. Choose a supported product or check account access.',
    CHANNEL_UNAVAILABLE: 'The selected channel is unavailable or incompatible. Check its status, resources and product.',
    CHANNEL_REQUIRED: 'This product requires an existing channel. Supply channelId or use a pay-per-use product.',
    COUNTRY_UNAVAILABLE: 'No compatible country is available. Choose a country supported by this product and channel.',
    CHANNEL_DISCOVERY_LIMIT: 'Channel discovery reached its safe limit. Supply an existing channelId; no channel was created.',
    CHANNEL_CREATION_UNCERTAIN: 'Channel creation outcome is unknown. Check existing channels or supply channelId before another creation. No retry was performed.',
    PROXY_GENERATION_UNCERTAIN: 'Proxy generation outcome is unknown; a session may have been generated. No retry was performed.',
    NO_PROXY_GENERATED: 'The API returned no proxy connection. Check channel availability before requesting another session.',
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
