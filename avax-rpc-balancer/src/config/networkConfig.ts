/**
 * Network configuration for AVAX RPC Balancer
 * Contains network-specific settings, chain IDs, and endpoints
 */

export interface NetworkInfo {
    id: string;
    name: string;
    chainId: number;
    currency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    defaultRpcEndpoint: string;
    explorerUrl: string;
    blockTime: number; // in seconds
    finality: number; // blocks needed for finality
    healthEndpoint?: string; // endpoint to check network health
    testnet: boolean;
    maxGasPrice?: number; // in nAVAX
    maxGasLimit?: number;
    supportedMethods?: string[]; // RPC methods supported on this network
    rateLimit?: {
        requests: number;
        period: number; // in milliseconds
    };
}

// Network configurations
export const networks: Record<string, NetworkInfo> = {
    'avalanche-mainnet': {
        id: 'avalanche-mainnet',
        name: 'Avalanche C-Chain',
        chainId: 43114,
        currency: {
            name: 'Avalanche',
            symbol: 'AVAX',
            decimals: 18,
        },
        defaultRpcEndpoint: 'https://api.avax.network/ext/bc/C/rpc',
        explorerUrl: 'https://snowtrace.io',
        blockTime: 2,
        finality: 12, // ~24 seconds for finality
        healthEndpoint: 'https://api.avax.network/ext/health',
        testnet: false,
        maxGasPrice: 225000000000, // 225 nAVAX
        maxGasLimit: 8000000,
        supportedMethods: [
            'eth_blockNumber',
            'eth_call',
            'eth_chainId',
            'eth_estimateGas',
            'eth_gasPrice',
            'eth_getBalance',
            'eth_getBlockByHash',
            'eth_getBlockByNumber',
            'eth_getCode',
            'eth_getLogs',
            'eth_getStorageAt',
            'eth_getTransactionByHash',
            'eth_getTransactionCount',
            'eth_getTransactionReceipt',
            'eth_sendRawTransaction',
            'eth_sendTransaction',
            'net_version',
            'web3_clientVersion'
        ],
        rateLimit: {
            requests: 200,
            period: 60000 // 1 minute
        }
    },
    'avalanche-fuji': {
        id: 'avalanche-fuji',
        name: 'Avalanche Fuji Testnet',
        chainId: 43113,
        currency: {
            name: 'Avalanche',
            symbol: 'AVAX',
            decimals: 18,
        },
        defaultRpcEndpoint: 'https://api.avax-test.network/ext/bc/C/rpc',
        explorerUrl: 'https://testnet.snowtrace.io',
        blockTime: 2,
        finality: 12,
        healthEndpoint: 'https://api.avax-test.network/ext/health',
        testnet: true,
        maxGasPrice: 225000000000, // 225 nAVAX
        maxGasLimit: 8000000,
        supportedMethods: [
            'eth_blockNumber',
            'eth_call',
            'eth_chainId',
            'eth_estimateGas',
            'eth_gasPrice',
            'eth_getBalance',
            'eth_getBlockByHash',
            'eth_getBlockByNumber',
            'eth_getCode',
            'eth_getLogs',
            'eth_getStorageAt',
            'eth_getTransactionByHash',
            'eth_getTransactionCount',
            'eth_getTransactionReceipt',
            'eth_sendRawTransaction',
            'eth_sendTransaction',
            'net_version',
            'web3_clientVersion'
        ],
        rateLimit: {
            requests: 150,
            period: 60000 // 1 minute
        }
    }
};

// Common utility functions for network configuration

/**
 * Get network configuration by network ID
 */
export function getNetworkConfig(networkId: string): NetworkInfo | undefined {
    return networks[networkId];
}

/**
 * Get the chain ID for a network
 */
export function getChainId(networkId: string): number | undefined {
    return networks[networkId]?.chainId;
}

/**
 * Check if a method is supported on a specific network
 */
export function isMethodSupported(networkId: string, method: string): boolean {
    const network = networks[networkId];
    if (!network || !network.supportedMethods) return false;
    return network.supportedMethods.includes(method);
}

/**
 * Get a list of all supported networks
 */
export function getSupportedNetworks(): string[] {
    return Object.keys(networks);
}

/**
 * Get a list of mainnet networks only
 */
export function getMainnetNetworks(): NetworkInfo[] {
    return Object.values(networks).filter(network => !network.testnet);
}

/**
 * Get a list of testnet networks only
 */
export function getTestnetNetworks(): NetworkInfo[] {
    return Object.values(networks).filter(network => network.testnet);
}

/**
 * Get the default RPC endpoint for a network
 */
export function getDefaultEndpoint(networkId: string): string | undefined {
    return networks[networkId]?.defaultRpcEndpoint;
}

/**
 * Get the explorer URL for a network
 */
export function getExplorerUrl(networkId: string): string | undefined {
    return networks[networkId]?.explorerUrl;
}

/**
 * Get the rate limit configuration for a network
 */
export function getNetworkRateLimit(networkId: string): { requests: number; period: number } | undefined {
    return networks[networkId]?.rateLimit;
}

/**
 * Format an explorer URL for a specific transaction
 */
export function formatTransactionUrl(networkId: string, txHash: string): string | undefined {
    const explorer = networks[networkId]?.explorerUrl;
    if (!explorer) return undefined;
    return `${explorer}/tx/${txHash}`;
}

/**
 * Format an explorer URL for a specific address
 */
export function formatAddressUrl(networkId: string, address: string): string | undefined {
    const explorer = networks[networkId]?.explorerUrl;
    if (!explorer) return undefined;
    return `${explorer}/address/${address}`;
}

/**
 * Get the maximum recommended gas price for a network
 */
export function getMaxGasPrice(networkId: string): number | undefined {
    return networks[networkId]?.maxGasPrice;
}

/**
 * Check if a network is a testnet
 */
export function isTestnet(networkId: string): boolean {
    return networks[networkId]?.testnet || false;
}

/**
 * Add a new network configuration (for dynamic configuration)
 */
export function addNetworkConfig(network: NetworkInfo): void {
    networks[network.id] = network;
    console.log(`Added new network configuration: ${network.id}`);
}

/**
 * Remove a network configuration
 */
export function removeNetworkConfig(networkId: string): boolean {
    if (networks[networkId]) {
        delete networks[networkId];
        console.log(`Removed network configuration: ${networkId}`);
        return true;
    }
    return false;
}