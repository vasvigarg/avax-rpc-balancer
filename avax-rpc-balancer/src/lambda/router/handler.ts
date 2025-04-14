import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { selectNode, LoadBalancingStrategy } from '../../services/loadBalancer';
import { proxyRequest } from '../../services/rpcHandler';
import { isMethodSupported, getNetworkConfig } from '../../config/networkConfig';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config'; // Keep dotenv support

const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || 'avalanche-mainnet';
const log = logger.withContext({ service: 'router-handler' });

/**
 * Error response formatter preserving original logic
 */
const createErrorResponse = (
  statusCode: number,
  id: string | number | null,
  message: string,
  code: number,
  error?: Error
): APIGatewayProxyResultV2 => {
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
        timestamp: new Date().toISOString(),
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  };
};

/**
 * Main handler function
 */
export const handleRpcRequest = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const network = getNetworkFromEvent(event) || DEFAULT_NETWORK;
  const strategy = getLoadBalancingStrategyFromEvent(event) || 'health-based';

  try {
    // Only POST is supported
    if (event.requestContext.http.method !== 'POST') {
      return createErrorResponse(405, null, 'Only POST requests are supported', 405);
    }

    // Check request body
    if (!event.body) {
      return createErrorResponse(400, null, 'Missing request body', -32700);
    }

    let requestPayload;
    try {
      requestPayload = JSON.parse(event.body);
    } catch (error) {
      return createErrorResponse(400, null, 'Invalid JSON request body', -32700, error as Error);
    }

    const isBatch = Array.isArray(requestPayload);
    let method: string | undefined;

    if (!isBatch && requestPayload.method) {
      method = requestPayload.method;

      if (method && !isMethodSupported(network, method)) {
        return createErrorResponse(
          400,
          requestPayload.id || null,
          `Method '${method}' is not supported on ${network}`,
          -32601
        );
      }
    }

    const clientIp = event.requestContext.http.sourceIp || 'unknown';

    // Sticky session support
    let sessionId: string | undefined;
    if (strategy === 'sticky') {
      sessionId = getOrCreateSessionId(event);
    }

    // Select target node
    let targetNode;
    try {
      targetNode = selectNode(
        network as 'avalanche-mainnet' | 'avalanche-fuji',
        strategy as LoadBalancingStrategy,
        method,
        sessionId
      );
    } catch (error) {
      return createErrorResponse(500, requestPayload.id || null, 'Internal server error during node selection', -32603, error as Error);
    }

    if (!targetNode) {
      log.error(`No available nodes for ${network}, method=${method}`);
      return createErrorResponse(503, requestPayload.id || null, 'No healthy backend nodes available', -32001);
    }

    log.info(`Selected node ${targetNode.id} for ${method || 'request'} on ${network}`);

    // Proxy the request
    try {
      const rpcResponse = await proxyRequest(targetNode.url, requestPayload, {
        nodeId: targetNode.id,
        timeout: 15000,
        retries: 1,
      });

      // CORS and session cookie support
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      };

      if (strategy === 'sticky' && sessionId) {
        headers['Set-Cookie'] = `avax_session=${sessionId}; Path=/; Max-Age=600; SameSite=Strict`;
      }

      return {
        statusCode: 200,
        body: JSON.stringify(rpcResponse),
        headers,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        return createErrorResponse(504, requestPayload.id || null, 'Gateway timeout', -32002, error);
      }

      return createErrorResponse(502, requestPayload.id || null, 'Bad gateway while proxying request', -32603, error as Error);
    }
  } catch (error) {
    console.error('Uncaught error in handler:', error);
    return createErrorResponse(500, null, (error as Error).message || 'Unknown internal error', -32603, error as Error);
  }
};

// Global error logging (keep original logic)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in Lambda:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in Lambda at:', promise, 'reason:', reason);
});

/**
 * Helpers
 */
function getNetworkFromEvent(event: APIGatewayProxyEventV2): string | undefined {
  const query = event.queryStringParameters;
  return query?.network;
}

function getLoadBalancingStrategyFromEvent(event: APIGatewayProxyEventV2): LoadBalancingStrategy | undefined {
  const strategyParam = event.queryStringParameters?.strategy;
  const valid = ['round-robin', 'random', 'weighted', 'health-based', 'sticky'];
  if (strategyParam && valid.includes(strategyParam)) {
    return strategyParam as LoadBalancingStrategy;
  }
  return undefined;
}

function getOrCreateSessionId(event: APIGatewayProxyEventV2): string {
  const cookieHeader = event.headers['cookie'] || event.headers['Cookie'];
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies['avax_session']) {
      return cookies['avax_session'];
    }
  }

  const sessionHeader = event.headers['x-session-id'] || event.headers['X-Session-Id'];
  if (sessionHeader) {
    return sessionHeader;
  }

  return uuidv4();
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.trim().split('=');
    if (parts.length === 2) {
      cookies[parts[0]] = parts[1];
    }
  });
  return cookies;
}
