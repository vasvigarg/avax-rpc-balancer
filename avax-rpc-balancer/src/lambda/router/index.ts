import { APIGatewayProxyResult } from 'aws-lambda';
import { handleRpcRequest as routeHandler } from './handler';
//import { HealthCheckConfig } from '../../services/healthChecker';
import { logger } from '../../utils/logger';
import { initializeCache } from '../../services/caching';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// Initialize all necessary services
function initializeServices() {
  // Initialize cache
  initializeCache({
    enabled: true,
    defaultTTL: 30000, // 30 seconds
    methodTTLs: {
      // You can customize these TTLs based on your specific needs
      eth_blockNumber: 5000, // 5 seconds - blocks change frequently
      eth_getBalance: 15000, // 15 seconds
      eth_call: 10000, // 10 seconds
      eth_getTransactionCount: 15000, // 15 seconds
      eth_getBlockByNumber: 60000, // 1 minute
      eth_getBlockByHash: 60000, // 1 minute
      eth_getLogs: 30000, // 30 seconds
      eth_gasPrice: 10000, // 10 seconds
      avax_getAtomicTx: 60000, // 1 minute
      avax_getAtomicTxStatus: 15000, // 15 seconds
      avax_getPendingTxs: 5000, // 5 seconds
    },
    maxEntries: 10000,
    // Enable persistent cache in production
    persistentCacheEnabled: process.env.NODE_ENV === 'production',
    persistentCachePath: process.env.CACHE_PATH || './data/rpc-cache.json',
  });
}

// Call the initialization function before exporting the handler
initializeServices();

//Export the handler for AWS Lambda
export const routerHandler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> =
  routeHandler;

const express = require('express');
//const morgan = require('morgan'); // for logging
//const config = require('./config');
const app = express();
const PORT = process.env.PORT || 3000;

const setupProxy = require('./proxy');
setupProxy(app);

const setupLogging = require('./logger');
setupLogging(app);

const setupErrorHandling = require('./errorHandler');
setupErrorHandling(app);

// Middleware for parsing JSON bodies
app.use(express.json());

// Basic server setup
app.listen(PORT, () => {
  console.log(`Blockchain proxy server running on port ${PORT}`);
});

module.exports = app;

const log = logger.withContext({ service: 'router' });

// Health check configuration from environment variables
//const healthCheckConfig: Partial<HealthCheckConfig> = {
//interval: Number(process.env.HEALTH_CHECK_INTERVAL || 10000),
//timeout: Number(process.env.HEALTH_CHECK_TIMEOUT || 2000),
//recoveryInterval: Number(process.env.HEALTH_RECOVERY_INTERVAL || 60000),
//healthEndpoint: process.env.HEALTH_CHECK_ENDPOINT || '/',
//failureThreshold: Number(process.env.HEALTH_FAILURE_THRESHOLD || 3),
//successThreshold: Number(process.env.HEALTH_SUCCESS_THRESHOLD || 2),
//};

// Initialize health checker on cold start
//const healthChecker = initHealthChecker(healthCheckConfig);
log.info('Health checker initialized and started');

export const handleRpcRequest = async (): //event: APIGatewayProxyEvent,
Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Success' }),
  };
};
