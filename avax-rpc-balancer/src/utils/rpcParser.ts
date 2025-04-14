import { logger } from './logger';

const log = logger.withContext({ service: 'rpc-parser' });

export interface RpcRequest {
    jsonrpc: string;
    method: string;
    params: any[];
    id: number | string;
}

/**
 * Parse JSON-RPC request payload and extract method information
 */
export function parseRpcRequest(payload: any): RpcRequest | RpcRequest[] | null {
    try {
        // Handle batch requests
        if (Array.isArray(payload)) {
            log.info(`Parsing batch request with ${payload.length} operations`);
            return payload.map(req => validateAndNormalizeRequest(req));
        }
        
        // Handle single request
        return validateAndNormalizeRequest(payload);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
        log.error(`Error parsing RPC request: ${errorMessage}`);
        return null;
    }
}

/**
 * Validate and normalize a single RPC request
 */
function validateAndNormalizeRequest(request: any): RpcRequest {
    // Basic validation
    if (!request) {
        throw new Error('Request cannot be empty');
    }
    
    if (request.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version, must be "2.0"');
    }
    
    if (typeof request.method !== 'string' || request.method === '') {
        throw new Error('Method must be a non-empty string');
    }
    
    if (!request.hasOwnProperty('id')) {
        throw new Error('Request must have an id');
    }
    
    // Normalize params to always be an array
    if (!request.params) {
        request.params = [];
    } else if (!Array.isArray(request.params)) {
        request.params = [request.params];
    }
    
    return request as RpcRequest;
}

/**
 * Categorize method by type (read/write/admin/etc)
 */
export enum MethodType {
    READ_ONLY,      // Methods that don't change state (eth_call, eth_getBalance)
    STATE_CHANGING, // Methods that modify state (eth_sendTransaction)
    ADMIN,          // Administrative methods (admin_*)
    DEBUG,          // Debug methods (debug_*)
    PERSONAL,       // Personal account methods (personal_*)
    MINER,          // Mining methods (miner_*)
    NET,            // Network related methods (net_*)
    WEB3,           // Web3 utilities (web3_*)
    ETH,            // Standard Ethereum methods (eth_*)
    EVM,            // EVM-specific methods (evm_*)
    TRACE,          // Tracing methods (trace_*)
    TXP             // Transaction pool methods (txpool_*)
}

/**
 * Categorize an RPC method based on its namespace and function
 */
export function categorizeMethod(method: string): MethodType {
    // Check if it's a state-changing method
    if (isStateChangingMethod(method)) {
        return MethodType.STATE_CHANGING;
    }
    
    // Check namespace
    if (method.startsWith('admin_')) return MethodType.ADMIN;
    if (method.startsWith('debug_')) return MethodType.DEBUG;
    if (method.startsWith('personal_')) return MethodType.PERSONAL;
    if (method.startsWith('miner_')) return MethodType.MINER;
    if (method.startsWith('net_')) return MethodType.NET;
    if (method.startsWith('web3_')) return MethodType.WEB3;
    if (method.startsWith('evm_')) return MethodType.EVM;
    if (method.startsWith('trace_')) return MethodType.TRACE;
    if (method.startsWith('txpool_')) return MethodType.TXP;
    
    // Default to read-only for remaining eth_* methods
    if (method.startsWith('eth_')) return MethodType.ETH;
    
    // Default to read-only for unknown methods
    return MethodType.READ_ONLY;
}

/**
 * Determine if a method modifies blockchain state
 */
export function isStateChangingMethod(method: string): boolean {
    const stateChangingMethods = [
        'eth_sendTransaction',
        'eth_sendRawTransaction',
        'eth_sign',
        'eth_signTransaction',
        'eth_submitTransaction',
        'eth_submitWork',
        'personal_sendTransaction',
        'miner_start',
        'miner_stop',
        'miner_setEtherbase',
        'debug_setHead',
        'evm_mine',
        'evm_reset'
    ];
    
    return stateChangingMethods.includes(method);
}

/**
 * Determine if a method requires authentication/authorization
 */
export function requiresAuth(method: string): boolean {
    const authRequiredMethods = [
        'personal_listAccounts',
        'personal_unlockAccount',
        'personal_sendTransaction',
        'personal_sign',
        'admin_addPeer',
        'admin_removePeer',
        'admin_startRPC',
        'admin_stopRPC',
        'admin_startWS',
        'admin_stopWS',
        'miner_start',
        'miner_stop',
        'debug_setHead'
    ];
    
    return authRequiredMethods.includes(method);
}