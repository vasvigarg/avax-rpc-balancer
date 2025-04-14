import { ScheduledEvent } from 'aws-lambda';
import axios from 'axios';
import { nodes, updateNodeHealth } from '../../config/nodeConfig';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getHealthChecker } from '../../services/healthChecker';
import { logger } from '../../utils/logger';

const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds

// Define a type for the expected JSON-RPC response
interface JsonRpcResponse {
    jsonrpc: string;
    result: any;
    id: string | number;
    error?: {
        code: number;
        message: string;
    };
}

async function checkNode(nodeUrl: string): Promise<boolean> {
    try {
        // Example: Use a simple, non-state-changing RPC call like eth_chainId
        const response = await axios.post(
            nodeUrl,
            { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: `health_${Date.now()}` },
            { timeout: HEALTH_CHECK_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
        );
        
        // Type assertion to inform TypeScript about the expected response structure
        const data = response.data as JsonRpcResponse;
        
        // Check if the response format is valid JSON-RPC and doesn't contain an error
        return response.status === 200 && data && data.jsonrpc === '2.0' && data.result !== undefined;
        // Add Avalanche-specific checks here (e.g., block height comparison)
    } catch (error) {
        console.warn(`Health check failed for ${nodeUrl}:`, error);
        return false;
    }
}

export const monitorNodeHealth = async (event: ScheduledEvent): Promise<void> => {
    console.log(`Running scheduled health checks at ${event.time}`);

    const checks = nodes.map(async (node) => {
        const isHealthy = await checkNode(node.url);
        updateNodeHealth(node.id, isHealthy); // Update in-memory state (replace with DB update)
    });

    await Promise.all(checks);

    console.log('Health checks completed.');
    // Optionally: Persist the results to DynamoDB or trigger alerts
};

const log = logger.withContext({ service: 'health-endpoint' });

export const handler = async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const requestId = event.requestContext.requestId || 'unknown';
    
    log.info(`Health check request received`, { requestId });
    
    try {
      const healthChecker = getHealthChecker();
      const healthReport = healthChecker.getHealthReport();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(healthReport)
      };
    } catch (error) {
      log.error('Error processing health check request', { error, requestId });
      
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Error processing health check request',
          error: error instanceof Error ? error.message : String(error)
        })
      };
    }
  };
  
  /**
   * Handler for administrative actions on node health
   */
  export const adminHandler = async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const requestId = event.requestContext.requestId || 'unknown';
    const nodeId = event.pathParameters?.nodeId;
    const action = event.pathParameters?.action; // enable, disable, reset
    
    log.info(`Admin health action: ${action}`, { requestId, nodeId, action });
    
    if (!nodeId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing node ID' })
      };
    }
    
    try {
      const healthChecker = getHealthChecker();
      let result = false;
      
      switch (action) {
        case 'enable':
          result = healthChecker.forceUpdateHealth(nodeId, true);
          break;
        case 'disable':
          result = healthChecker.forceUpdateHealth(nodeId, false);
          break;
        default:
          return {
            statusCode: 400,
            body: JSON.stringify({ message: `Invalid action: ${action}` })
          };
      }
      
      if (result) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: `Successfully ${action === 'enable' ? 'enabled' : 'disabled'} node ${nodeId}`
          })
        };
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: `Node ${nodeId} not found` })
        };
      }
    } catch (error) {
      log.error('Error processing admin action', { error, requestId, nodeId, action });
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Error processing admin action',
          error: error instanceof Error ? error.message : String(error)
        })
      };
    }
  };