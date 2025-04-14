import { BaseNodeAdapter } from './baseNodeAdapter';

export class NethermindNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'nethermind';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  async getNodeInfo(): Promise<any> {
    return this.callRpc('admin_nodeInfo');
  }
  
  async getPeers(): Promise<any> {
    return this.callRpc('admin_peers');
  }
  
  // Nethermind-specific debug methods
  async getTraceTransaction(txHash: string): Promise<any> {
    return this.callRpc('debug_traceTransaction', [txHash]);
  }
  
  async getChainLevel(level: number): Promise<any> {
    return this.callRpc('debug_getChainLevel', [level]);
  }
}