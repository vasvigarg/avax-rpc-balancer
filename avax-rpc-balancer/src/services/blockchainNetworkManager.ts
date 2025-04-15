import { networks, NetworkInfo, getNetworkConfig } from '../config/networkConfig';
import { nodes, NodeInfo, getNodesByNetwork } from '../config/nodeConfig';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { 
  initializeNodesForNetwork, 
  events as nodeEvents, 
  executeNetworkCall, 
  getBestNodeAdapter,
  checkNodeHealth
} from '../services/nodeService';

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

/**
 * Network state enum
 */
export enum NetworkState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

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

// Store network states
const networkStates = new Map<NetworkType, NetworkState>();

// Initialize the map
Object.values(networks).forEach(network => {
    chainIdToNetwork.set(network.chainId, network.id);
    
    // Initialize all networks as disconnected
    if (network.id === 'avalanche-mainnet' || network.id === 'avalanche-fuji') {
        networkStates.set(network.id, NetworkState.DISCONNECTED);
    }
});

// Block polling interval in milliseconds
const BLOCK_POLLING_INTERVAL = 15000;

// Store block polling timers by network
const blockPollingTimers: Map<NetworkType, NodeJS.Timeout> = new Map();

// Track initialized networks
const initializedNetworks: Set<NetworkType> = new Set();

// Track latest block numbers
const latestBlockNumbers = new Map<NetworkType, number>();

// Network events type definitions
interface NetworkManagerEvents {
  'network:stateChanged': (networkType: NetworkType, state: NetworkState) => void;
  'network:blockUpdated': (networkType: NetworkType, blockNumber: number) => void;
  'network:error': (networkType: NetworkType, error: Error) => void;
  'networks:initialized': (networks: NetworkType[]) => void;
}

// Create a typed event emitter
export interface NetworkManagerEventEmitter extends EventEmitter {
  on<E extends keyof NetworkManagerEvents>(event: E, listener: NetworkManagerEvents[E]): this;
  emit<E extends keyof NetworkManagerEvents>(event: E, ...args: Parameters<NetworkManagerEvents[E]>): boolean;
}

export const events: NetworkManagerEventEmitter = new EventEmitter() as NetworkManagerEventEmitter;

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
        
        // Initialize network state if it's a supported network type
        if (networkInfo.id === 'avalanche-mainnet' || networkInfo.id === 'avalanche-fuji') {
            networkStates.set(networkInfo.id, NetworkState.DISCONNECTED);
        }
        
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

/**
 * Initialize blockchain network manager and connect to specified networks
 */
export async function initializeNetworks(networkTypes: NetworkType[]): Promise<NetworkType[]> {
    try {
        log.info(`Initializing blockchain networks: ${networkTypes.join(', ')}`);
        
        // Set up node service event listeners
        setupNodeServiceEventListeners();
        
        // Initialize each network sequentially
        const successfulNetworks: NetworkType[] = [];
        
        for (const network of networkTypes) {
            // Skip already initialized networks
            if (initializedNetworks.has(network)) {
                log.info(`Network ${network} already initialized, skipping`);
                successfulNetworks.push(network);
                continue;
            }
            
            // Update network state to connecting
            updateNetworkState(network, NetworkState.CONNECTING);
            
            // Initialize nodes for this network
            const success = await initializeNodesForNetwork(network);
            
            if (success) {
                log.info(`Successfully initialized network ${network}`);
                successfulNetworks.push(network);
                initializedNetworks.add(network);
                
                // Start block polling for this network
                startBlockPolling(network);
            } else {
                log.error(`Failed to initialize network ${network}`);
                updateNetworkState(network, NetworkState.ERROR, new Error('Failed to initialize nodes'));
            }
        }
        
        // Emit initialized event with successful networks
        if (successfulNetworks.length > 0) {
            events.emit('networks:initialized', successfulNetworks);
        }
        
        return successfulNetworks;
    } catch (error) {
        log.error(`Error initializing blockchain networks: ${error}`);
        throw error;
    }
}

/**
 * Set up event listeners for node service events
 */
function setupNodeServiceEventListeners(): void {
    // Listen for network ready event
    nodeEvents.on('network:ready', (networkType: NetworkType) => {
        updateNetworkState(networkType, NetworkState.CONNECTED);
    });
    
    // Listen for network error event
    nodeEvents.on('network:error', (networkType: NetworkType, error: Error) => {
        updateNetworkState(networkType, NetworkState.ERROR, error);
    });
    
    // Listen for node connected event
    nodeEvents.on('node:connected', (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && (node.network === 'avalanche-mainnet' || node.network === 'avalanche-fuji')) {
            log.info(`Node ${nodeId} connected for network ${node.network}`);
        }
    });
    
    // Listen for node health event
    nodeEvents.on('node:health', (nodeId: string, healthy: boolean) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && (node.network === 'avalanche-mainnet' || node.network === 'avalanche-fuji')) {
            if (!healthy) {
                log.warn(`Node ${nodeId} for network ${node.network} became unhealthy`);
            }
        }
    });
}

/**
 * Update network state and emit event
 */
function updateNetworkState(networkType: NetworkType, state: NetworkState, error?: Error): void {
    // Update network state
    networkStates.set(networkType, state);
    
    // Emit state change event
    events.emit('network:stateChanged', networkType, state);
    
    if (state === NetworkState.ERROR && error) {
        events.emit('network:error', networkType, error);
    }
    
    log.info(`Network ${networkType} state changed to ${state}${error ? ': ' + error.message : ''}`);
}

/**
 * Start polling for latest block on specified network
 */
function startBlockPolling(networkType: NetworkType): void {
    // Clear any existing timer
    stopBlockPolling(networkType);
    
    // Create new timer
    const timer = setInterval(async () => {
        await pollLatestBlock(networkType);
    }, BLOCK_POLLING_INTERVAL);
    
    // Don't prevent Node.js from exiting
    timer.unref();
    
    blockPollingTimers.set(networkType, timer);
    log.info(`Started block polling for network ${networkType}`);
}

/**
 * Stop block polling for specified network
 */
function stopBlockPolling(networkType: NetworkType): void {
    const timer = blockPollingTimers.get(networkType);
    
    if (timer) {
        clearInterval(timer);
        blockPollingTimers.delete(networkType);
        log.info(`Stopped block polling for network ${networkType}`);
    }
}

/**
 * Poll latest block for a network
 */
async function pollLatestBlock(networkType: NetworkType): Promise<void> {
    try {
        const networkState = networkStates.get(networkType);
        
        if (!networkState || networkState !== NetworkState.CONNECTED) {
            return;
        }
        
        const blockHex = await executeNetworkCall<string>(networkType, 'eth_blockNumber');
        const blockNumber = parseInt(blockHex, 16);
        
        if (isNaN(blockNumber)) {
            throw new Error(`Invalid block number format: ${blockHex}`);
        }
        
        // Only emit event if block number changed
        const previousBlock = latestBlockNumbers.get(networkType);
        if (previousBlock !== blockNumber) {
            latestBlockNumbers.set(networkType, blockNumber);
            events.emit('network:blockUpdated', networkType, blockNumber);
            log.debug(`Network ${networkType} block updated to ${blockNumber}`);
        }
    } catch (error) {
        log.error(`Error polling latest block for ${networkType}: ${error}`);
    }
}

/**
 * Get the current network state
 */
export function getNetworkState(networkType: NetworkType): NetworkState {
    return networkStates.get(networkType) || NetworkState.DISCONNECTED;
}

/**
 * Check if a network is initialized and connected
 */
export function isNetworkConnected(networkType: NetworkType): boolean {
    return networkStates.get(networkType) === NetworkState.CONNECTED;
}

/**
 * Get the latest block number for a network
 */
export function getLatestBlockNumber(networkType: NetworkType): number | undefined {
    return latestBlockNumbers.get(networkType);
}

/**
 * Execute RPC call on a network
 */
export async function executeRpcCall<T>(
    networkType: NetworkType,
    method: string,
    params: any[] = []
): Promise<T> {
    if (!isNetworkConnected(networkType)) {
        throw new Error(`Network ${networkType} is not connected`);
    }
    
    return executeNetworkCall<T>(networkType, method, params);
}

/**
 * Get the current gas price for a network
 */
export async function getGasPrice(networkType: NetworkType): Promise<bigint> {
    const gasPriceHex = await executeRpcCall<string>(networkType, 'eth_gasPrice');
    return BigInt(gasPriceHex);
}

/**
 * Get block details by number or hash
 */
export async function getBlock(
    networkType: NetworkType,
    blockIdentifier: string | number,
    includeTransactions: boolean = false
): Promise<any> {
    let blockIdParam: string;
    
    if (typeof blockIdentifier === 'number') {
        blockIdParam = '0x' + blockIdentifier.toString(16);
    } else {
        blockIdParam = blockIdentifier;
    }
    
    return executeRpcCall(networkType, 'eth_getBlockByNumber', [blockIdParam, includeTransactions]);
}

/**
 * Get transaction by hash
 */
export async function getTransaction(networkType: NetworkType, txHash: string): Promise<any> {
    return executeRpcCall(networkType, 'eth_getTransactionByHash', [txHash]);
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(networkType: NetworkType, txHash: string): Promise<any> {
    return executeRpcCall(networkType, 'eth_getTransactionReceipt', [txHash]);
}

/**
 * Get balance for an address
 */
export async function getBalance(
    networkType: NetworkType,
    address: string,
    blockIdentifier: string | number = 'latest'
): Promise<bigint> {
    let blockIdParam: string;
    
    if (typeof blockIdentifier === 'number') {
        blockIdParam = '0x' + blockIdentifier.toString(16);
    } else {
        blockIdParam = blockIdentifier;
    }
    
    const balanceHex = await executeRpcCall<string>(
        networkType,
        'eth_getBalance',
        [address, blockIdParam]
    );
    
    return BigInt(balanceHex);
}

/**
 * Send a raw transaction
 */
export async function sendRawTransaction(networkType: NetworkType, signedTx: string): Promise<string> {
    return executeRpcCall<string>(networkType, 'eth_sendRawTransaction', [signedTx]);
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(networkType: NetworkType, txObject: any): Promise<bigint> {
    const gasHex = await executeRpcCall<string>(networkType, 'eth_estimateGas', [txObject]);
    return BigInt(gasHex);
}

/**
 * Call a contract method (without state changes)
 */
export async function callContract(
    networkType: NetworkType,
    callObject: any,
    blockIdentifier: string | number = 'latest'
): Promise<string> {
    let blockIdParam: string;
    
    if (typeof blockIdentifier === 'number') {
        blockIdParam = '0x' + blockIdentifier.toString(16);
    } else {
        blockIdParam = blockIdentifier;
    }
    
    return executeRpcCall<string>(networkType, 'eth_call', [callObject, blockIdParam]);
}

/**
 * Get transaction count for an address (nonce)
 */
export async function getTransactionCount(
    networkType: NetworkType,
    address: string,
    blockIdentifier: string | number = 'latest'
): Promise<number> {
    let blockIdParam: string;
    
    if (typeof blockIdentifier === 'number') {
        blockIdParam = '0x' + blockIdentifier.toString(16);
    } else {
        blockIdParam = blockIdentifier;
    }
    
    const countHex = await executeRpcCall<string>(
        networkType,
        'eth_getTransactionCount',
        [address, blockIdParam]
    );
    
    return parseInt(countHex, 16);
}

/**
 * Wait for a transaction to be mined
 */
export async function waitForTransaction(
    networkType: NetworkType,
    txHash: string,
    confirmations: number = 1,
    timeout: number = 60000
): Promise<any> {
    const startTime = Date.now();
    let receipt = null;
    
    while (Date.now() - startTime < timeout) {
        try {
            receipt = await getTransactionReceipt(networkType, txHash);
            
            if (receipt) {
                // If we need confirmations
                if (confirmations > 0) {
                    const currentBlock = await executeRpcCall<string>(networkType, 'eth_blockNumber');
                    const currentBlockNumber = parseInt(currentBlock, 16);
                    const receiptBlockNumber = parseInt(receipt.blockNumber, 16);
                    
                    if (currentBlockNumber - receiptBlockNumber >= confirmations) {
                        return receipt;
                    }
                } else {
                    return receipt;
                }
            }
            
            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            log.error(`Error checking transaction ${txHash}: ${error}`);
            // Continue waiting
        }
    }
    
    throw new Error(`Transaction ${txHash} was not confirmed within the timeout period`);
}

/**
 * Get a block explorer URL for a transaction, address, or block
 */
export function getExplorerUrl(
    networkType: NetworkType,
    type: 'tx' | 'address' | 'block',
    value: string
): string {
    const network = getNetworkConfig(networkType);
    
    if (!network || !network.explorerUrl) {
        throw new Error(`No explorer URL available for network ${networkType}`);
    }
    
    const baseUrl = network.explorerUrl.endsWith('/')
        ? network.explorerUrl.slice(0, -1)
        : network.explorerUrl;
    
    switch (type) {
        case 'tx':
            return `${baseUrl}/tx/${value}`;
        case 'address':
            return `${baseUrl}/address/${value}`;
        case 'block':
            return `${baseUrl}/block/${value}`;
        default:
            throw new Error(`Invalid explorer URL type: ${type}`);
    }
}

/**
 * Check if method is supported on this network
 */
export function isMethodSupported(networkType: NetworkType, method: string): boolean {
    const network = getNetworkConfig(networkType);
    
    if (!network) {
        return false;
    }
    
    // If supportedMethods is not defined, assume common methods are supported
    if (!network.supportedMethods) {
        return defaultMethodSupport[method] || false;
    }
    
    return network.supportedMethods.includes(method);
}

/**
 * Force health check on all nodes for a network
 */
export async function checkNetworkHealth(networkType: NetworkType): Promise<boolean> {
    const networkNodes = getNodesByNetwork(networkType);
    
    if (!networkNodes || networkNodes.length === 0) {
        log.warn(`No nodes found for network ${networkType}`);
        return false;
    }
    
    // Check health of all nodes
    const healthPromises = networkNodes.map(node => checkNodeHealth(node.id));
    const results = await Promise.all(healthPromises);
    
    // Network is healthy if at least one node is healthy
    const isHealthy = results.some(result => result === true);
    
    if (isHealthy) {
        updateNetworkState(networkType, NetworkState.CONNECTED);
    } else {
        updateNetworkState(networkType, NetworkState.ERROR, new Error('No healthy nodes available'));
    }
    
    return isHealthy;
}

/**
 * Get code at an address
 */
export async function getCode(
    networkType: NetworkType,
    address: string,
    blockIdentifier: string | number = 'latest'
): Promise<string> {
    let blockIdParam: string;
    
    if (typeof blockIdentifier === 'number') {
        blockIdParam = '0x' + blockIdentifier.toString(16);
    } else {
        blockIdParam = blockIdentifier;
    }
    
    return executeRpcCall<string>(networkType, 'eth_getCode', [address, blockIdParam]);
}

/**
 * Check if an address is a contract
 */
export async function isContract(
    networkType: NetworkType,
    address: string
): Promise<boolean> {
    const code = await getCode(networkType, address);
    return code !== '0x' && code !== '0x0';
}

/**
 * Clean up resources on shutdown
 */
export function shutdown(): void {
    // Stop all block polling
    for (const networkType of blockPollingTimers.keys()) {
        stopBlockPolling(networkType);
    }
    
    // Remove all event listeners
    events.removeAllListeners();
    
    initializedNetworks.clear();
    log.info('Blockchain network manager shutdown complete');
}