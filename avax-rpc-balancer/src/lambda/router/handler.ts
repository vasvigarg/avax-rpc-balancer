import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { selectNode } from '../../services/loadBalancer';
import { proxyRequest } from '../../services/rpcHandler';
// Import config loader if needed:
import 'dotenv/config'; // if using dotenv

// Error response helper function incorporating errorHandler.js logic
const createErrorResponse = (
  statusCode: number, 
  id: string | number | null, 
  message: string, 
  code: number,
  error?: Error
): APIGatewayProxyResultV2 => {
  // Log detailed error information
  console.error(`Error [${code}]: ${message}`, error);
  
  return {
    statusCode,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        message: 'Blockchain node proxy error',
        details: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
        code: code,
        timestamp: new Date().toISOString()
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  };
};

// Setup global error handlers similar to errorHandler.js
// These will help with debugging but won't prevent Lambda termination
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in Lambda:', err);
  // Can't prevent Lambda termination, but logging helps with CloudWatch debugging
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in Lambda at:', promise, 'reason:', reason);
});

export const handleRpcRequest = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Check HTTP method
    if (event.requestContext.http.method !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({
          error: {
            message: 'Blockchain node proxy error',
            details: process.env.NODE_ENV === 'production' ? 'Method Not Allowed' : 'Only POST requests are supported',
            code: 405,
            timestamp: new Date().toISOString()
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
    
    // Check if request body exists
    if (!event.body) {
      return createErrorResponse(400, null, 'Missing request body', -32700);
    }
    
    // Parse request body
    let requestPayload;
    try {
      // API Gateway V2 automatically base64 decodes if isBase64Encoded is true
      requestPayload = JSON.parse(event.body);
    } catch (error) {
      return createErrorResponse(400, null, 'Invalid JSON request body', -32700, error as Error);
    }
    
    // Validate JSON-RPC request format
    if (!requestPayload.jsonrpc || requestPayload.jsonrpc !== '2.0' || !requestPayload.method) {
      return createErrorResponse(400, requestPayload.id || null, 'Invalid JSON-RPC 2.0 request', -32600);
    }
    
    // Select target node for load balancing
    let targetNode;
    try {
      targetNode = selectNode(); // Use default round-robin
    } catch (error) {
      return createErrorResponse(500, requestPayload.id || null, 'Internal server error during node selection', -32603, error as Error);
    }
    
    if (!targetNode) {
      return createErrorResponse(503, requestPayload.id || null, 'No healthy backend nodes available', -32001);
    }
    
    // Proxy the request to the selected node
    try {
      const rpcResponse = await proxyRequest(targetNode.url, requestPayload);
      
      return {
        statusCode: 200, // Even RPC errors return 200 OK at HTTP level
        body: JSON.stringify(rpcResponse),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*', // CORS header
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        },
      };
    } catch (error) {
      // Handle network failures or timeouts
      if (error instanceof Error && error.message.includes('timeout')) {
        return createErrorResponse(504, requestPayload.id || null, 'Gateway timeout', -32002, error);
      }
      
      // Handle other proxy errors
      return createErrorResponse(502, requestPayload.id || null, 'Bad gateway while proxying request', -32603, error as Error);
    }
    
  } catch (error) {
    // Handle any uncaught errors, following errorHandler.js pattern
    console.error('Uncaught error in handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          message: 'Blockchain node proxy error',
          details: process.env.NODE_ENV === 'production' ? 'Internal server error' : (error as Error).message,
          code: -32603,
          timestamp: new Date().toISOString()
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};