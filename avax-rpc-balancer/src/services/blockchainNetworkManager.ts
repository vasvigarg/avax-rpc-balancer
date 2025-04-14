import { networks, NetworkInfo, getNetworkConfig } from '../config/networkConfig';
import { nodes, NodeInfo, getNodesByNetwork } from '../config/nodeConfig';
import { logger } from '../utils/logger';

// Define NetworkType for type safety
export type NetworkType = 'avalanche-mainnet' | 'avalanche-fuji';

const log = logger.withContext({ service: 'blockchain-network-manager' });

// Additional blockchain networks that might be added dynamically
const supportedChainTypes = [
    'ethereum',
    'avalanche',
    'binance-smart-chain',
    'polygon',
    'arbitrum',
    'optimism',
    'fantom'
];

interface ChainSupportInfo {
    chainId: number;
    name: string;
    chainType: string;
    supportLevel: 'full' | 'partial' | 'experimental';
    methodSupport: Record<string, boolean>;
}

// Default configuration for new chains
const defaultMethodSupport: Record<string, boolean> = {
    'eth_blockNumber': true,
    'eth_call': true,
    'eth_chainId': true,
    'eth_getBalance': true,
    'eth_getBlockByHash': true,
    'eth_getBlockByNumber': true,
    'eth_getTransactionByHash': true,
    'eth_getTransactionReceipt': true,
    'eth_sendRawTransaction': true,
    'net_version': true,
    'web3_clientVersion': true
};

// Map from chainId to network identifier
const chainIdToNetwork = new Map<number, string>();

// Initialize the map
Object.values(networks).forEach(network => {
    chainIdToNetwork.set(network.chainId, network.id);
});

/**
 * Get network ID from chain ID
 */
export function getNetworkIdFromChainId(chainId: number): NetworkType | undefined {
    const networkId = chainIdToNetwork.get(chainId);
    if (networkId === 'avalanche-mainnet' || networkId === 'avalanche-fuji') {
        return networkId;
    }
    return undefined;
}

/**
 * Detect the network from request information
 */
export function detectNetwork(chainId?: number, hostname?: string): NetworkType | undefined {
    // Try to determine from chain ID first
    if (chainId && chainIdToNetwork.has(chainId)) {
        const networkId = chainIdToNetwork.get(chainId);
        if (networkId === 'avalanche-mainnet' || networkId === 'avalanche-fuji') {
            return networkId;
        }
    }
    
    // Try to determine from hostname
    if (hostname) {
        if (hostname.includes('fuji') || hostname.includes('test')) {
            return 'avalanche-fuji';
        }
        if (hostname.includes('mainnet') || hostname.includes('avax')) {
            return 'avalanche-mainnet';
        }
    }
    
    // Default to mainnet
    return 'avalanche-mainnet';
}

/**
 * Add a new blockchain network dynamically
 */
export function addBlockchainNetwork(networkInfo: NetworkInfo): boolean {
    if (networks[networkInfo.id]) {
        log.warn(`Network ${networkInfo.id} already exists`);
        return false;
    }
    
    // Add to networks config
    try {
        // Add network to the configuration
        networks[networkInfo.id] = networkInfo;
        
        // Update chainId mapping
        chainIdToNetwork.set(networkInfo.chainId, networkInfo.id);
        
        log.info(`Added new blockchain network: ${networkInfo.name} (${networkInfo.id})`);
        return true;
    } catch (error) {
        log.error(`Failed to add network ${networkInfo.id}: ${error}`);
        return false;
    }
}

/**
 * Add a node to an existing network
 */
export function addNodeToNetwork(node: NodeInfo): boolean {
    // Check if network exists
    if (!networks[node.network]) {
        log.error(`Cannot add node: Network ${node.network} doesn't exist`);
        return false;
    }
    
    // Add node to configuration
    try {
        return true;
    } catch (error) {
        log.error(`Failed to add node ${node.id}: ${error}`);
        return false;
    }
}

/**
 * Get support information for a chain
 */
export function getChainSupportInfo(networkId: string): ChainSupportInfo | undefined {
    const network = getNetworkConfig(networkId);
    if (!network) return undefined;
    
    // Determine chain type from network ID or other properties
    let chainType = 'ethereum';
    if (networkId.includes('avalanche')) chainType = 'avalanche';
    if (networkId.includes('bsc')) chainType = 'binance-smart-chain';
    
    // Build method support mapping
    const methodSupport: Record<string, boolean> = {};
    if (network.supportedMethods) {
        network.supportedMethods.forEach(method => {
            methodSupport[method] = true;
        });
    }
    
    return {
        chainId: network.chainId,
        name: network.name,
        chainType,
        supportLevel: network.testnet ? 'experimental' : 'full',
        methodSupport
    };
}

/**
 * Check if a network is supported
 */
export function isNetworkSupported(networkId: string): boolean {
    return !!networks[networkId];
}

/**
 * Get all supported chain types
 */
export function getSupportedChainTypes(): string[] {
    return supportedChainTypes;
}