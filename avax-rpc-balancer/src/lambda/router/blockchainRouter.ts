import { MethodType, categorizeMethod, isStateChangingMethod, requiresAuth } from '../../utils/rpcParser';
import { getNodesByNetwork, getHealthyNodesByNetwork, nodeHasCapability, NodeInfo } from '../../config/nodeConfig';
import { isMethodSupported } from '../../config/networkConfig';
import { logger } from '../../utils/logger';

const log = logger.withContext({ service: 'blockchain-router' });

// Define the network type to match the constraint in nodeConfig
type NetworkType = 'avalanche-mainnet' | 'avalanche-fuji';

interface RouterOptions {
    network: NetworkType; // Updated type
    method: string;
    isReadOnly?: boolean;
    requiresSpecialCapability?: string;
    preferArchivalNode?: boolean;
}

/**
 * Get the appropriate node URL for a particular blockchain RPC request
 */
export function getNodeForRequest(options: RouterOptions): string | null {
    const { network, method, isReadOnly = true, requiresSpecialCapability, preferArchivalNode } = options;
    
    // Check if method is supported on the network
    if (!isMethodSupported(network, method)) {
        log.warn(`Method ${method} is not supported on network ${network}`);
        return null;
    }
    
    // Get healthy nodes for this network
    const nodes = getHealthyNodesByNetwork(network);
    if (nodes.length === 0) {
        log.error(`No healthy nodes available for network ${network}`);
        return null;
    }
    
    // Filter nodes by capability if needed
    let eligibleNodes = nodes;
    
    if (requiresSpecialCapability) {
        eligibleNodes = nodes.filter(node => 
            nodeHasCapability(node.id, requiresSpecialCapability)
        );
        
        if (eligibleNodes.length === 0) {
            log.warn(`No nodes with capability ${requiresSpecialCapability} available for network ${network}`);
            return null;
        }
    }
    
    // For state-changing methods, use priority-based selection
    if (!isReadOnly) {
        // Sort by priority (lower number = higher priority)
        eligibleNodes.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        return eligibleNodes[0].url;
    }
    
    // For read-only methods, implement a simple round-robin selection
    // In production, you would use a more sophisticated algorithm
    const randomIndex = Math.floor(Math.random() * eligibleNodes.length);
    return eligibleNodes[randomIndex].url;
}

/**
 * Generate routing options based on the RPC method
 */
export function generateRoutingOptions(method: string, network: string): RouterOptions | null {
    // Validate that the network is of the correct type
    if (network !== 'avalanche-mainnet' && network !== 'avalanche-fuji') {
        log.error(`Invalid network: ${network}. Expected 'avalanche-mainnet' or 'avalanche-fuji'`);
        return null;
    }
    
    const methodCategory = categorizeMethod(method);
    
    const options: RouterOptions = {
        network: network as NetworkType, // Type assertion since we've validated above
        method,
        isReadOnly: !isStateChangingMethod(method)
    };
    
    // Adjust options based on method category
    switch (methodCategory) {
        case MethodType.ADMIN:
        case MethodType.DEBUG:
        case MethodType.PERSONAL:
            options.requiresSpecialCapability = methodCategory.toString().toLowerCase();
            break;
            
        case MethodType.TRACE:
            options.requiresSpecialCapability = 'archive';
            options.preferArchivalNode = true;
            break;
            
        case MethodType.EVM:
            options.requiresSpecialCapability = 'debug';
            break;
    }
    
    return options;
}