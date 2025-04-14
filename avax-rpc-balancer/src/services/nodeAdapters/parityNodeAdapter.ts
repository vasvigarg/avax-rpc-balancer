import { BaseNodeAdapter } from './baseNodeAdapter';

export class ParityNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'parity';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  async getNodeInfo(): Promise<any> {
    return this.callRpc('parity_nodeInfo');
  }
  
  async getPeers(): Promise<any[]> {
    return this.callRpc('parity_peers');
  }
  
  async getTraceTransaction(txHash: string): Promise<any> {
    return this.callRpc('trace_transaction', [txHash]);
  }
}
