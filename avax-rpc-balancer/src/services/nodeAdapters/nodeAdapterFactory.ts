import { BaseNodeAdapter, NodeAdapterConfig } from './baseNodeAdapter';
import { GethNodeAdapter } from './GethNodeAdapter';
import { ParityNodeAdapter } from './parityNodeAdapter';
import { AvalancheNodeAdapter } from './avalancheNodeAdapter';
import { NethermindNodeAdapter } from './nethermindNodeAdapter';
import { logger } from '../../utils/logger';

export enum NodeClientType {
  GETH = 'geth',
  PARITY = 'parity',
  AVALANCHE = 'avalanche',
  NETHERMIND = 'nethermind',
  GENERIC = 'generic'
}

export class NodeAdapterFactory {
  private static log = logger.withContext({ service: 'node-adapter-factory' });

  static createAdapter(clientType: NodeClientType, config: NodeAdapterConfig): BaseNodeAdapter {
    switch (clientType) {
      case NodeClientType.GETH:
        return new GethNodeAdapter(config);
      case NodeClientType.PARITY:
        return new ParityNodeAdapter(config);
      case NodeClientType.AVALANCHE:
        return new AvalancheNodeAdapter(config);
      case NodeClientType.NETHERMIND:
        return new NethermindNodeAdapter(config);
      default:
        this.log.warn(`No specific adapter for ${clientType}, using generic adapter`);
        return new GethNodeAdapter(config); // Default to Geth as most compatible
    }
  }

  static async detectClientType(config: NodeAdapterConfig): Promise<NodeClientType> {
    // Create a temporary adapter to detect node type
    const tempAdapter = new GethNodeAdapter(config);
    
    try {
      const clientVersion = await tempAdapter.getClientVersion();
      const clientVersionLower = clientVersion.toLowerCase();
      
      if (clientVersionLower.includes('geth')) {
        return NodeClientType.GETH;
      } else if (clientVersionLower.includes('parity') || clientVersionLower.includes('openethereum')) {
        return NodeClientType.PARITY;
      } else if (clientVersionLower.includes('avalanche') || clientVersionLower.includes('avax')) {
        return NodeClientType.AVALANCHE;
      } else if (clientVersionLower.includes('nethermind')) {
        return NodeClientType.NETHERMIND;
      }
      
      return NodeClientType.GENERIC;
    } catch (error) {
      this.log.error(`Failed to detect client type: ${error}`);
      return NodeClientType.GENERIC;
    }
  }
}