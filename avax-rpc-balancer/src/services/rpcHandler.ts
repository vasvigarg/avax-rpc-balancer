import axios, { AxiosError } from 'axios';

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
    error?: { code: number; message: string };
}

const RPC_TIMEOUT = 5000; // 5 seconds

export async function proxyRequest(targetUrl: string, requestPayload: RpcRequest): Promise<RpcResponse> {
    console.log(`Proxying request ID ${requestPayload.id} (${requestPayload.method}) to ${targetUrl}`);
    try {
        const response = await axios.post<RpcResponse>(targetUrl, requestPayload, {
            headers: {
                'Content-Type': 'application/json',
                // Add any other required headers
            },
            timeout: RPC_TIMEOUT,
        });
        return response.data;
    } catch (error) {
        console.error(`Error proxying request ID ${requestPayload.id} to ${targetUrl}:`, error);

        const axiosError = error as AxiosError;
        const defaultError = { code: -32000, message: 'Proxy request failed' };

        // Construct a valid JSON-RPC error response
        return {
            jsonrpc: '2.0',
            id: requestPayload.id,
            error: {
                code: axiosError.response?.status || defaultError.code,
                message: axiosError.message || defaultError.message,
                // You might want to add more details here depending on the error
            },
        };
    }
}