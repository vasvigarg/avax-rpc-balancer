import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleRpcRequest as routeHandler } from './handler';
import { nodes } from '../../config/nodeConfig';
import { initHealthChecker, HealthCheckConfig } from '../../services/healthChecker';
import { logger } from '../../utils/logger';

const express = require('express');
const morgan = require('morgan'); // for logging
const config = require('./config');
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
const healthCheckConfig: Partial<HealthCheckConfig> = {
  interval: Number(process.env.HEALTH_CHECK_INTERVAL || 10000),
  timeout: Number(process.env.HEALTH_CHECK_TIMEOUT || 2000),
  recoveryInterval: Number(process.env.HEALTH_RECOVERY_INTERVAL || 60000),
  healthEndpoint: process.env.HEALTH_CHECK_ENDPOINT || '/',
  failureThreshold: Number(process.env.HEALTH_FAILURE_THRESHOLD || 3),
  successThreshold: Number(process.env.HEALTH_SUCCESS_THRESHOLD || 2)
};

// Initialize health checker on cold start
const healthChecker = initHealthChecker(healthCheckConfig);
log.info('Health checker initialized and started');

export const handleRpcRequest = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Success' }),
  };
};