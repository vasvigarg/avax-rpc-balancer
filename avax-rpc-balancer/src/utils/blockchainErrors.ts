import { logger } from './logger';

const log = logger.withContext({ service: 'blockchain-errors' });

// Standard JSON-RPC error codes
export enum RpcErrorCode {
    // Standard JSON-RPC 2.0 errors
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    
    // Implementation-specific error codes
    SERVER_ERROR_START = -32000,
    SERVER_ERROR_END = -32099,
    
    // Ethereum-specific error codes
    ACTION_REJECTED = 4001,
    UNAUTHORIZED = 4100,
    UNSUPPORTED_METHOD = 4200,
    DISCONNECTED = 4900,
    CHAIN_DISCONNECTED = 4901,
    
    // Custom blockchain RPC error codes
    NODE_UNAVAILABLE = -32001,
    AUTHENTICATION_ERROR = -32002,
    RATE_LIMIT_EXCEEDED = -32005,
    EXECUTION_REVERTED = -32015,
    BLOCK_NOT_FOUND = -32020,
    TX_NOT_FOUND = -32021,
    NONCE_TOO_LOW = -32022,
    GAS_PRICE_TOO_LOW = -32023,
    INSUFFICIENT_FUNDS = -32024,
    CONTRACT_VALIDATION_FAILED = -32025
}

// Error message mapping
const errorMessages: Record<number, string> = {
    [RpcErrorCode.PARSE_ERROR]: 'Parse error: Invalid JSON',
    [RpcErrorCode.INVALID_REQUEST]: 'Invalid request',
    [RpcErrorCode.METHOD_NOT_FOUND]: 'Method not found',
    [RpcErrorCode.INVALID_PARAMS]: 'Invalid parameters',
    [RpcErrorCode.INTERNAL_ERROR]: 'Internal error',
    [RpcErrorCode.NODE_UNAVAILABLE]: 'Node unavailable',
    [RpcErrorCode.AUTHENTICATION_ERROR]: 'Authentication error',
    [RpcErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
    [RpcErrorCode.EXECUTION_REVERTED]: 'Execution reverted',
    [RpcErrorCode.BLOCK_NOT_FOUND]: 'Block not found',
    [RpcErrorCode.TX_NOT_FOUND]: 'Transaction not found',
    [RpcErrorCode.NONCE_TOO_LOW]: 'Nonce too low',
    [RpcErrorCode.GAS_PRICE_TOO_LOW]: 'Gas price too low',
    [RpcErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient funds',
    [RpcErrorCode.CONTRACT_VALIDATION_FAILED]: 'Contract validation failed'
};

export interface RpcError {
    code: number;
    message: string;
    data?: any;
}

/**
 * Create a standard JSON-RPC error object
 */
export function createRpcError(code: number, message?: string, data?: any): RpcError {
    const defaultMessage = errorMessages[code] || 'Unknown error';
    
    return {
        code,
        message: message || defaultMessage,
        data
    };
}

/**
 * Parse blockchain node error responses to standardize error handling
 */
export function parseNodeError(error: any): RpcError {
    // Handle string errors
    if (typeof error === 'string') {
        if (error.includes('insufficient funds')) {
            return createRpcError(RpcErrorCode.INSUFFICIENT_FUNDS);
        }
        if (error.includes('nonce too low')) {
            return createRpcError(RpcErrorCode.NONCE_TOO_LOW);
        }
        if (error.includes('gas price too low')) {
            return createRpcError(RpcErrorCode.GAS_PRICE_TOO_LOW);
        }
        if (error.includes('execution reverted')) {
            return createRpcError(RpcErrorCode.EXECUTION_REVERTED, error);
        }
        
        // Generic error
        return createRpcError(RpcErrorCode.INTERNAL_ERROR, error);
    }
    
    // Handle Error objects
    if (error instanceof Error) {
        return createRpcError(RpcErrorCode.INTERNAL_ERROR, error.message);
    }
    
    // Handle JSON-RPC error objects
    if (error && typeof error === 'object') {
        if (error.code && typeof error.code === 'number') {
            return createRpcError(
                error.code,
                error.message || errorMessages[error.code] || 'Unknown error',
                error.data
            );
        }
        
        // Error from Axios or other sources
        if (error.response && error.response.data) {
            const responseData = error.response.data;
            
            // If the response data contains a JSON-RPC error
            if (responseData.error) {
                return createRpcError(
                    responseData.error.code || RpcErrorCode.INTERNAL_ERROR,
                    responseData.error.message || 'Unknown error',
                    responseData.error.data
                );
            }
            
            // Return generic error with the response status
            return createRpcError(
                RpcErrorCode.INTERNAL_ERROR,
                `HTTP Error: ${error.response.status} ${error.response.statusText}`,
                responseData
            );
        }
    }
    
    // Default fallback
    return createRpcError(RpcErrorCode.INTERNAL_ERROR, 'Unknown error');
}

/**
 * Generate a blockchain-specific error response
 */
export function createErrorResponse(id: number | string | (number | string)[],
                                   code: number,
                                   message?: string,
                                   data?: any) {
    const errorObj = createRpcError(code, message, data);
    
    if (Array.isArray(id)) {
        return id.map(singleId => ({
            jsonrpc: '2.0',
            id: singleId,
            error: errorObj
        }));
    }
    
    return {
        jsonrpc: '2.0',
        id,
        error: errorObj
    };
}

/**
 * Map HTTP errors to RPC errors
 */
export function mapHttpErrorToRpcError(statusCode: number, message?: string): RpcError {
    switch (statusCode) {
        case 400:
            return createRpcError(RpcErrorCode.INVALID_REQUEST, message);
        case 401:
            return createRpcError(RpcErrorCode.AUTHENTICATION_ERROR, message);
        case 404:
            return createRpcError(RpcErrorCode.METHOD_NOT_FOUND, message);
        case 429:
            return createRpcError(RpcErrorCode.RATE_LIMIT_EXCEEDED, message);
        case 500:
        case 502:
        case 503:
            return createRpcError(RpcErrorCode.NODE_UNAVAILABLE, message);
        default:
            return createRpcError(RpcErrorCode.INTERNAL_ERROR, message);
    }
}

/**
 * Log an RPC error with appropriate severity
 */
export function logRpcError(error: RpcError): void {
    // Determine severity based on error code
    if (error.code <= -32600 && error.code >= -32700) {
        // Client errors (parse error, invalid request)
        log.warn(`RPC Client Error [${error.code}]: ${error.message}`);
    } else if (error.code === RpcErrorCode.RATE_LIMIT_EXCEEDED) {
        log.warn(`Rate Limit Exceeded [${error.code}]: ${error.message}`);
    } else if (error.code <= -32000 && error.code >= -32099) {
        // Server errors
        log.error(`RPC Server Error [${error.code}]: ${error.message}`, error.data);
    } else {
        // Other errors (chain-specific, etc.)
        log.error(`Blockchain Error [${error.code}]: ${error.message}`, error.data);
    }
}