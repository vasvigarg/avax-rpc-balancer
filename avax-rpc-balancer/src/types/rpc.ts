/**
 * Types for JSON-RPC Request and Response handling
 * 
 * This file defines the standard types for JSON-RPC 2.0 protocol
 * used throughout the avax-rpc-balancer application.
 */

/**
 * Standard JSON-RPC 2.0 Request object
 */
export interface RpcRequest {
    jsonrpc: string;  // Must be "2.0"
    method: string;   // The RPC method to call
    params: any[];    // Parameters to pass to the method
    id: number | string; // Request identifier
}

/**
 * JSON-RPC 2.0 Error object
 */
export interface RpcError {
    code: number;     // Error code
    message: string;  // Error message
    data?: any;       // Additional error data (optional)
}

/**
 * Standard JSON-RPC 2.0 Response object
 */
export interface RpcResponse {
    jsonrpc: string;       // Must be "2.0"
    id: number | string;   // Request identifier (must match the request)
    result?: any;          // Result data (only present if no error)
    error?: RpcError;      // Error object (only present if call failed)
}

/**
 * Proxy configuration options for RPC requests
 */
export interface ProxyOptions {
    timeout?: number;                   // Request timeout in milliseconds
    retries?: number;                   // Number of retries on failure
    retryDelay?: number;                // Delay between retries in milliseconds
    headers?: Record<string, string>;   // Custom headers to include
    validateRequest?: boolean;          // Whether to validate the request
    nodeId?: string;                    // ID of the node being used
    skipCache?: boolean;                // Option to bypass cache
}

/**
 * Standard error codes for JSON-RPC 2.0
 * 
 * -32000 to -32099: Server error (implementation-defined)
 * -32600: Invalid Request
 * -32601: Method not found
 * -32602: Invalid params
 * -32603: Internal error
 * -32700: Parse error
 * 
 * Custom error codes:
 * -32001: Authentication error
 * -32002: Authorization error
 * -32003: Node unavailable
 * -32004: Request timeout
 * -32005: Rate limit exceeded
 */
export enum RpcErrorCode {
    // Standard JSON-RPC error codes
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    
    // Custom error codes for avax-rpc-balancer
    ServerError = -32000,
    AuthenticationError = -32001,
    AuthorizationError = -32002,
    NodeUnavailable = -32003,
    RequestTimeout = -32004,
    RateLimitExceeded = -32005,
    CircuitBreakerOpen = -32006,
    CacheError = -32007
}

/**
 * Categorizes RPC methods by their impact on blockchain state
 */
export enum RpcMethodCategory {
    // Methods that don't change state and can be safely cached
    READ = 'read',
    
    // Methods that may change blockchain state
    WRITE = 'write',
    
    // Methods that relate to account or node management
    ADMIN = 'admin',
    
    // Methods for debugging or system information
    DEBUG = 'debug'
}

/**
 * Maps common RPC methods to their categories
 */
export const RPC_METHOD_CATEGORIES: Record<string, RpcMethodCategory> = {
    // Ethereum read methods
    'eth_blockNumber': RpcMethodCategory.READ,
    'eth_call': RpcMethodCategory.READ,
    'eth_chainId': RpcMethodCategory.READ, 
    'eth_estimateGas': RpcMethodCategory.READ,
    'eth_gasPrice': RpcMethodCategory.READ,
    'eth_getBalance': RpcMethodCategory.READ,
    'eth_getBlockByHash': RpcMethodCategory.READ,
    'eth_getBlockByNumber': RpcMethodCategory.READ,
    'eth_getCode': RpcMethodCategory.READ,
    'eth_getLogs': RpcMethodCategory.READ,
    'eth_getStorageAt': RpcMethodCategory.READ,
    'eth_getTransactionByBlockHashAndIndex': RpcMethodCategory.READ,
    'eth_getTransactionByBlockNumberAndIndex': RpcMethodCategory.READ,
    'eth_getTransactionByHash': RpcMethodCategory.READ,
    'eth_getTransactionCount': RpcMethodCategory.READ,
    'eth_getTransactionReceipt': RpcMethodCategory.READ,
    'eth_getUncleByBlockHashAndIndex': RpcMethodCategory.READ,
    'eth_getUncleByBlockNumberAndIndex': RpcMethodCategory.READ,
    'eth_getUncleCountByBlockHash': RpcMethodCategory.READ,
    'eth_getUncleCountByBlockNumber': RpcMethodCategory.READ,
    'eth_getProof': RpcMethodCategory.READ,
    'eth_getBlockReceipts': RpcMethodCategory.READ,
    'eth_syncing': RpcMethodCategory.READ,
    
    // Ethereum write methods
    'eth_sendTransaction': RpcMethodCategory.WRITE,
    'eth_sendRawTransaction': RpcMethodCategory.WRITE,
    'eth_sign': RpcMethodCategory.WRITE,
    'eth_signTransaction': RpcMethodCategory.WRITE,
    'eth_submitWork': RpcMethodCategory.WRITE,
    'eth_submitHashrate': RpcMethodCategory.WRITE,
    
    // Avalanche C-Chain methods
    'avax_getAtomicTx': RpcMethodCategory.READ,
    'avax_getAtomicTxStatus': RpcMethodCategory.READ,
    'avax_getPendingTxs': RpcMethodCategory.READ,
    'avax_issueTx': RpcMethodCategory.WRITE,
    'avax_signTx': RpcMethodCategory.WRITE,
    
    // Admin methods
    'admin_addPeer': RpcMethodCategory.ADMIN,
    'admin_removePeer': RpcMethodCategory.ADMIN,
    'admin_nodeInfo': RpcMethodCategory.ADMIN,
    'admin_peers': RpcMethodCategory.ADMIN,
    'admin_startRPC': RpcMethodCategory.ADMIN,
    'admin_stopRPC': RpcMethodCategory.ADMIN,
    'admin_startWS': RpcMethodCategory.ADMIN,
    'admin_stopWS': RpcMethodCategory.ADMIN,
    
    // Debug methods
    'debug_traceTransaction': RpcMethodCategory.DEBUG,
    'debug_traceCall': RpcMethodCategory.DEBUG,
    'debug_traceBlockByHash': RpcMethodCategory.DEBUG,
    'debug_traceBlockByNumber': RpcMethodCategory.DEBUG
};

/**
 * Helper function to determine if a method changes state
 */
export function isStateChangingMethod(method: string): boolean {
    // Check if method is explicitly categorized
    if (method in RPC_METHOD_CATEGORIES) {
        return RPC_METHOD_CATEGORIES[method] === RpcMethodCategory.WRITE;
    }
    
    // Otherwise check method prefixes
    const writeOperationPrefixes = [
        'eth_send',
        'eth_sign',
        'eth_submit',
        'personal_',
        'miner_',
        'admin_',
        'avax_issue',
        'avax_sign'
    ];
    
    return writeOperationPrefixes.some(prefix => method.startsWith(prefix));
}

/**
 * Helper function to determine if a method can be cached
 */
export function isCacheableMethod(method: string): boolean {
    // Non-cacheable categories
    const nonCacheableCategories = [
        RpcMethodCategory.WRITE,
        RpcMethodCategory.ADMIN,
        RpcMethodCategory.DEBUG
    ];
    
    // Check if explicitly categorized
    if (method in RPC_METHOD_CATEGORIES) {
        return !nonCacheableCategories.includes(RPC_METHOD_CATEGORIES[method]);
    }
    
    // Methods not explicitly categorized are considered non-cacheable
    // unless they follow certain patterns
    
    // Check if it starts with a read prefix
    const readPrefixes = ['eth_get', 'eth_call', 'eth_estimate', 'avax_get'];
    const isReadPrefix = readPrefixes.some(prefix => method.startsWith(prefix));
    
    // Common read-only methods that don't follow the prefixes
    const otherReadMethods = [
        'eth_blockNumber',
        'eth_chainId',
        'eth_gasPrice',
        'eth_syncing',
        'net_version',
        'net_listening',
        'net_peerCount'
    ];
    
    return isReadPrefix || otherReadMethods.includes(method);
}