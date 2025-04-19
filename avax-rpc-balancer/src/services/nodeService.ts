import { NodeInfo, getNodesByNetwork, updateNodeHealth, getNodeById } from '../config/nodeConfig';
import { NetworkType } from '../services/blockchainNetworkManager';
import { NodeAdapterFactory, NodeClientType } from './nodeAdapters/nodeAdapterFactory';
import { BaseNodeAdapter } from './nodeAdapters/baseNodeAdapter';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

const log = logger.withContext({ service: 'node-service' });

// Create a typed event emitter for node service events
interface NodeServiceEvents {
  'node:connected': (nodeId: string) => void;
  'node:disconnected': (nodeId: string) => void;
  'node:health': (nodeId: string, healthy: boolean) => void;
  'node:error': (nodeId: string, error: Error) => void;
  'network:ready': (networkId: NetworkType) => void;
  'network:error': (networkId: NetworkType, error: Error) => void;
}

export interface NodeServiceEventEmitter extends EventEmitter {
  on<E extends keyof NodeServiceEvents>(event: E, listener: NodeServiceEvents[E]): this;
  emit<E extends keyof NodeServiceEvents>(
    event: E,
    ...args: Parameters<NodeServiceEvents[E]>
  ): boolean;
}

const events: NodeServiceEventEmitter = new EventEmitter() as NodeServiceEventEmitter;

// Store node adapters by ID
const nodeAdapters = new Map<string, BaseNodeAdapter>();

// Store node metadata by ID
const nodeMetadata = new Map<string, NodeInfo>();

// Store preferred nodes by network
const preferredNodes = new Map<NetworkType, string>();

// Health check interval in milliseconds
const HEALTH_CHECK_INTERVAL = 30000;

// Heath check timeouts
let healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

/**
 * Initialize node adapters for a specific network
 */
export async function initializeNodesForNetwork(networkType: NetworkType): Promise<boolean> {
  try {
    const nodes = getNodesByNetwork(networkType);

    if (!nodes || nodes.length === 0) {
      log.warn(`No nodes found for network ${networkType}`);
      return false;
    }

    log.info(`Initializing ${nodes.length} nodes for network ${networkType}`);

    const initPromises = nodes.map(node => initializeNode(node));
    const results = await Promise.allSettled(initPromises);

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

    if (successCount === 0) {
      log.error(`Failed to initialize any nodes for network ${networkType}`);
      events.emit('network:error', networkType, new Error('No nodes available'));
      return false;
    }

    log.info(`Successfully initialized ${successCount}/${nodes.length} nodes for ${networkType}`);
    events.emit('network:ready', networkType);

    // Start health checks for all nodes
    startHealthChecks();

    return true;
  } catch (error) {
    log.error(`Error initializing nodes for network ${networkType}: ${error}`);
    events.emit(
      'network:error',
      networkType,
      error instanceof Error ? error : new Error(String(error)),
    );
    return false;
  }
}

/**
 * Initialize a single node
 */
export async function initializeNode(node: NodeInfo): Promise<boolean> {
  try {
    // Skip if already initialized
    if (nodeAdapters.has(node.id)) {
      log.info(`Node ${node.id} already initialized, skipping`);
      return true;
    }

    log.info(`Initializing node ${node.id} at ${node.url}`);

    // Store node metadata
    nodeMetadata.set(node.id, node);

    // Create adapter configuration
    const config = {
      url: node.url,
      timeout: 30000, // Default timeout since it's not in your NodeInfo
      headers: {}, // Empty headers since it's not in your NodeInfo
      nodeId: node.id, // Added nodeId to match NodeAdapterConfig
    };

    // Infer client type from network or capabilities
    let clientType: NodeClientType;

    if (node.network.includes('avalanche')) {
      clientType = NodeClientType.AVALANCHE;
    } else {
      // Default to detecting the client type
      log.info(`Detecting client type for node ${node.id}`);
      clientType = await NodeAdapterFactory.detectClientType(config);
      log.info(`Detected client type for node ${node.id}: ${clientType}`);
    }

    // Create the adapter
    const adapter = NodeAdapterFactory.createAdapter(clientType, config);
    nodeAdapters.set(node.id, adapter);

    // Check if node is actually responding
    const isHealthy = await checkNodeHealth(node.id);

    if (isHealthy) {
      log.info(`Node ${node.id} (${clientType}) initialized and healthy`);
      events.emit('node:connected', node.id);

      // Set as preferred node if it's the first healthy node for this network
      if (!preferredNodes.has(node.network as NetworkType)) {
        preferredNodes.set(node.network as NetworkType, node.id);
        log.info(`Set ${node.id} as preferred node for ${node.network}`);
      }

      return true;
    } else {
      log.warn(`Node ${node.id} initialized but failed health check`);
      events.emit('node:error', node.id, new Error('Failed health check during initialization'));
      return false;
    }
  } catch (error) {
    log.error(`Failed to initialize node ${node.id}: ${error}`);
    events.emit('node:error', node.id, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Check health of a specific node
 */
export async function checkNodeHealth(nodeId: string): Promise<boolean> {
  const adapter = nodeAdapters.get(nodeId);
  if (!adapter) {
    log.warn(`Cannot check health of unknown node: ${nodeId}`);
    return false;
  }

  try {
    // Get both client version and current block to ensure node is synced and responding
    const [clientVersion, blockNumber] = await Promise.all([
      adapter.getClientVersion(),
      adapter.callRpc('eth_blockNumber'),
    ]);

    // Validate responses
    const isHealthy = Boolean(
      clientVersion &&
        typeof clientVersion === 'string' &&
        blockNumber &&
        typeof blockNumber === 'string',
    );

    // Update health status in nodeConfig
    updateNodeHealth(nodeId, isHealthy);

    // Log state changes
    const node = getNodeById(nodeId);
    if (node?.healthy !== isHealthy) {
      if (isHealthy) {
        log.info(`Node ${nodeId} is now healthy`);
        events.emit('node:health', nodeId, true);
      } else {
        log.warn(`Node ${nodeId} is now unhealthy`);
        events.emit('node:health', nodeId, false);
      }
    }

    return isHealthy;
  } catch (error) {
    // Update health status to unhealthy
    updateNodeHealth(nodeId, false);

    const node = getNodeById(nodeId);
    if (node?.healthy !== false) {
      log.warn(`Node ${nodeId} health check failed: ${error}`);
      events.emit('node:health', nodeId, false);
    }

    return false;
  }
}

/**
 * Start health check intervals for all nodes
 */
export function startHealthChecks(): void {
  // Clear any existing timers
  stopHealthChecks();

  // Create new timers for each node
  for (const nodeId of nodeAdapters.keys()) {
    const timer = setInterval(async () => {
      await checkNodeHealth(nodeId);
      updatePreferredNodesIfNeeded();
    }, HEALTH_CHECK_INTERVAL);

    // Don't prevent Node.js from exiting
    timer.unref();

    healthCheckTimers.set(nodeId, timer);
  }

  log.info(`Started health checks for ${healthCheckTimers.size} nodes`);
}

/**
 * Stop all health check intervals
 */
export function stopHealthChecks(): void {
  for (const [nodeId, timer] of healthCheckTimers.entries()) {
    clearInterval(timer);
    healthCheckTimers.delete(nodeId);
  }

  log.info('Stopped all node health checks');
}

/**
 * Update preferred nodes based on health status
 */
function updatePreferredNodesIfNeeded(): void {
  // Group nodes by network
  const nodesByNetwork = new Map<NetworkType, string[]>();

  for (const [nodeId, node] of nodeMetadata.entries()) {
    const network = node.network as NetworkType;
    if (!nodesByNetwork.has(network)) {
      nodesByNetwork.set(network, []);
    }
    nodesByNetwork.get(network)?.push(nodeId);
  }

  // Check and update preferred nodes for each network
  for (const [network, nodes] of nodesByNetwork.entries()) {
    const currentPreferred = preferredNodes.get(network);

    // If current preferred node is healthy, keep it
    if (currentPreferred) {
      const node = getNodeById(currentPreferred);
      if (node && node.healthy) {
        continue;
      }
    }

    // Find a healthy node, preferring lower priority value
    const healthyNodes = nodes
      .map(nodeId => getNodeById(nodeId))
      .filter((node): node is NodeInfo => node !== undefined && node.healthy)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    if (healthyNodes.length > 0) {
      const bestNode = healthyNodes[0];
      preferredNodes.set(network, bestNode.id);
      log.info(`Updated preferred node for ${network} to ${bestNode.id}`);
    } else if (currentPreferred) {
      // If no healthy nodes and we had a preferred, remove it
      preferredNodes.delete(network);
      log.warn(`No healthy nodes available for ${network}`);
    }
  }
}

/**
 * Get a node adapter by ID
 */
export function getNodeAdapter(nodeId: string): BaseNodeAdapter | undefined {
  return nodeAdapters.get(nodeId);
}

/**
 * Get all node adapters for a network
 */
export function getNodeAdaptersForNetwork(networkType: NetworkType): BaseNodeAdapter[] {
  const adapters: BaseNodeAdapter[] = [];

  for (const [nodeId, node] of nodeMetadata.entries()) {
    if (node.network === networkType && nodeAdapters.has(nodeId)) {
      const adapter = nodeAdapters.get(nodeId);
      if (adapter) {
        adapters.push(adapter);
      }
    }
  }

  return adapters;
}

/**
 * Get the best node adapter for a network based on health and priority
 */
export function getBestNodeAdapter(networkType: NetworkType): BaseNodeAdapter | undefined {
  // Check if we have a preferred healthy node
  const preferredNodeId = preferredNodes.get(networkType);
  if (preferredNodeId) {
    const node = getNodeById(preferredNodeId);
    if (node && node.healthy) {
      return nodeAdapters.get(preferredNodeId);
    }
  }

  // Find healthy node with lowest priority
  const nodes = getNodesByNetwork(networkType)
    .filter(node => node.healthy)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  if (nodes.length > 0) {
    return nodeAdapters.get(nodes[0].id);
  }

  // If no healthy nodes, return the first available node with a warning
  const anyNode = getNodesByNetwork(networkType)[0];
  if (anyNode) {
    log.warn(
      `No healthy nodes available for ${networkType}, using potentially unhealthy node ${anyNode.id}`,
    );
    return nodeAdapters.get(anyNode.id);
  }

  log.error(`No nodes available for network ${networkType}`);
  return undefined;
}

/**
 * Execute a call on the best available node for a network
 */
export async function executeNetworkCall<T>(
  networkType: NetworkType,
  method: string,
  params: any[] = [],
): Promise<T> {
  const adapter = getBestNodeAdapter(networkType);

  if (!adapter) {
    throw new Error(`No node available for network ${networkType}`);
  }

  try {
    return await adapter.callRpc(method, params);
  } catch (error) {
    // If call fails, try to find another node
    log.warn(`Call failed on preferred node for ${networkType}, trying alternatives`);

    // Get all adapters except the one that just failed
    const adapters = getNodeAdaptersForNetwork(networkType);
    const failedNodeId = getNodeIdByAdapter(adapter);

    // Try each alternative node
    for (const altAdapter of adapters) {
      const altNodeId = getNodeIdByAdapter(altAdapter);

      // Skip the node that already failed
      if (altNodeId === failedNodeId) {
        continue;
      }

      try {
        const result = await altAdapter.callRpc(method, params);

        // Update preferred node on success
        if (altNodeId) {
          preferredNodes.set(networkType, altNodeId);
          log.info(
            `Updated preferred node for ${networkType} to ${altNodeId} after successful failover`,
          );
        }

        return result;
      } catch (innerError) {
        log.warn(`Failover call failed on node ${altNodeId}: ${innerError}`);
        // Continue to next node
      }
    }

    // If all nodes failed, throw the original error
    throw error;
  }
}

/**
 * Get node ID by adapter instance (reverse lookup)
 */
function getNodeIdByAdapter(adapter: BaseNodeAdapter): string | undefined {
  for (const [nodeId, nodeAdapter] of nodeAdapters.entries()) {
    if (nodeAdapter === adapter) {
      return nodeId;
    }
  }
  return undefined;
}

/**
 * Clean up resources when shutting down
 */
export function shutdown(): void {
  stopHealthChecks();
  events.removeAllListeners();
  nodeAdapters.clear();
  nodeMetadata.clear();
  preferredNodes.clear();
  log.info('Node service shutdown complete');
}

// Export events for other modules to subscribe
export { events };
