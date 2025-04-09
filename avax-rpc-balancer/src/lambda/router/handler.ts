import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { selectNode } from '../../services/loadBalancer';
import { proxyRequest } from '../../services/rpcHandler';
// Import config loader if needed: import 'dotenv/config'; // if using dotenv

export const handleRpcRequest = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    if (event.requestContext.http.method !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    let requestPayload;
    try {
        // API Gateway V2 automatically base64 decodes if isBase64Encoded is true
        requestPayload = JSON.parse(event.body || '{}');
        // TODO: Add validation using validators.ts
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid JSON request body' }),
        };
    }

    const targetNode = selectNode(); // Use default round-robin

    if (!targetNode) {
        return {
            statusCode: 503, // Service Unavailable
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: requestPayload.id || null,
                error: { code: -32001, message: 'No healthy backend nodes available' }
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    const rpcResponse = await proxyRequest(targetNode.url, requestPayload);

    return {
        statusCode: 200, // Even RPC errors return 200 OK at HTTP level
        body: JSON.stringify(rpcResponse),
        headers: {
            'Content-Type': 'application/json',
            // Add CORS headers if needed
        },
    };
};