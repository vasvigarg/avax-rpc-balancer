import axios from 'axios';
import { recordSuccessfulRequest, recordFailedRequest } from './loadBalancer';
import { logger } from '../utils/logger';

const log = logger.withContext({ service: 'rpc-handler' });

// Define the types that are missing from axios import
type AxiosError = {
  response?: {
    status?: number;
    statusText?: string;
    data?: any;
  };
  code?: string;
  message: string;
};

type AxiosRequestConfig = {
  headers?: Record<string, string>;
  timeout?: number;
};

interface RpcRequest {
    jsonrpc: string;
    method: string;
    params: any[];
    id: number | string;
}

interface RpcResponse {
    jsonrpc: string;
    id: number | string;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

interface ProxyOptions {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    headers?: Record<string, string>;
    validateRequest?: boolean;
    nodeId?: string; // Added nodeId to track which node we're using
}

const DEFAULT_OPTIONS: ProxyOptions = {
    timeout: 5000, // 5 seconds
    retries: 2,
    retryDelay: 1000, // 1 second
    validateRequest: true,
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AVAX-RPC-Balancer/1.0',
    },
};

/**
 * Simple validation for JSON-RPC requests
 */
function validateJsonRpcRequest(request: RpcRequest): void {
    if (request.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version, must be "2.0"');
    }
    
    if (typeof request.method !== 'string' || request.method === '') {
        throw new Error('Method must be a non-empty string');
    }
    
    if (!request.hasOwnProperty('id')) {
        throw new Error('Request must have an id');
    }
}

/**
 * Proxies a JSON-RPC request to the specified blockchain node
 */
export async function proxyRequest(
    targetUrl: string, 
    requestPayload: RpcRequest | RpcRequest[], 
    options: ProxyOptions = {}
): Promise<RpcResponse | RpcResponse[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const isBatch = Array.isArray(requestPayload);
    const nodeId = opts.nodeId;
    
    // Log the incoming request
    if (isBatch) {
        log.info(`Proxying batch request with ${requestPayload.length} operations to ${targetUrl}${nodeId ? ` (Node: ${nodeId})` : ''}`);
    } else {
        log.info(`Proxying request ID ${requestPayload.id} (${requestPayload.method}) to ${targetUrl}${nodeId ? ` (Node: ${nodeId})` : ''}`);
    }
    
    // Validate the request if required
    if (opts.validateRequest) {
        try {
            if (isBatch) {
                requestPayload.forEach(req => validateJsonRpcRequest(req));
            } else {
                validateJsonRpcRequest(requestPayload);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            log.error(`Invalid JSON-RPC request: ${errorMessage}`);
            const errorResponse = createErrorResponse(
                isBatch ? requestPayload.map(r => r.id) : requestPayload.id,
                -32600,
                `Invalid Request: ${errorMessage}`
            );
            return errorResponse;
        }
    }
    
    // Configure the request
    const axiosConfig: AxiosRequestConfig = {
        headers: opts.headers,
        timeout: opts.timeout,
    };
    
    // Execute request with retries - modified to handle the Promise type issue
    return executeWithRetry(
        // Use a more generic Promise return type to avoid TypeScript issues
        async () => {
            const result = await axios.post(targetUrl, requestPayload, axiosConfig);
            return result;
        },
        requestPayload,
        opts.retries || 0,
        opts.retryDelay || 0,
        targetUrl,
        nodeId
    );
}

/**
 * Execute the request with retry logic and circuit breaker integration
 */
async function executeWithRetry(
    fn: () => Promise<any>,
    requestPayload: RpcRequest | RpcRequest[],
    retries: number,
    retryDelay: number,
    targetUrl: string,
    nodeId?: string
): Promise<RpcResponse | RpcResponse[]> {
    const isBatch = Array.isArray(requestPayload);
    const requestId = isBatch ? 'batch' : (requestPayload as RpcRequest).id;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Explicitly cast the response to any to avoid type conflicts
            const response = await fn() as any;
            
            // Log successful response
            log.info(`Request ID ${requestId} completed successfully`);
            
            // Record the success for circuit breaker if nodeId is provided
            if (nodeId) {
                recordSuccessfulRequest(nodeId);
            }
            
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            const isLastAttempt = attempt === retries;
            
            log.error(`Attempt ${attempt + 1}/${retries + 1} failed for request ID ${requestId}: ${axiosError.message}`);
            
            // Record failure for circuit breaker if this is the last attempt and nodeId is provided
            if (isLastAttempt && nodeId) {
                recordFailedRequest(nodeId);
                log.warn(`Marked node ${nodeId} with a failure for circuit breaker`);
            }
            
            if (isLastAttempt) {
                // No more retries, return error response
                log.error(`All retry attempts failed for request to ${targetUrl}`);
                return createErrorResponse(
                    isBatch ? (requestPayload as RpcRequest[]).map(r => r.id) : (requestPayload as RpcRequest).id,
                    determineErrorCode(axiosError),
                    axiosError.message,
                    {
                        url: targetUrl,
                        status: axiosError.response?.status,
                        statusText: axiosError.response?.statusText,
                    }
                );
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            log.info(`Retrying request ID ${requestId} (attempt ${attempt + 2}/${retries + 1})`);
        }
    }
    
    // This should never be reached but TypeScript requires it
    throw new Error("Unexpected execution path");
}

/**
 * Create a standard JSON-RPC error response
 */
function createErrorResponse(
    id: number | string | (number | string)[],
    code: number,
    message: string,
    data?: any
): RpcResponse | RpcResponse[] {
    if (Array.isArray(id)) {
        return id.map(singleId => ({
            jsonrpc: '2.0',
            id: singleId,
            error: { code, message, data },
        }));
    }
    
    return {
        jsonrpc: '2.0',
        id,
        error: { code, message, data },
    };
}

/**
 * Determine the appropriate JSON-RPC error code based on the axios error
 */
function determineErrorCode(error: AxiosError): number {
    if (error.code === 'ECONNABORTED') return -32603; // Internal error (timeout)
    if (error.code === 'ECONNREFUSED') return -32003; // Node unavailable
    if (error.response?.status === 401) return -32001; // Authentication error
    if (error.response?.status === 429) return -32005; // Rate limit exceeded
    return -32000; // Default server error
}

/**
 * Filter sensitive RPC methods that should be limited or blocked
 */
export function isMethodPermitted(method: string, restrictedMethods: string[] = []): boolean {
    // Some methods might be restricted for security reasons
    const defaultRestrictedMethods = [
        'personal_sendTransaction', 
        'personal_unlockAccount',
        'admin_startWS',
        'admin_stopWS'
    ];
    
    const allRestricted = [...defaultRestrictedMethods, ...restrictedMethods];
    return !allRestricted.includes(method);
}

/**
 * Rate limit check for expensive RPC calls
 */
export function checkRateLimits(method: string, clientIp: string): boolean {
    // Implement rate limiting logic here
    // Return false if rate limit exceeded
    return true;
}