import { BaseNodeAdapter } from './baseNodeAdapter';

export class GethNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'geth';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  async getNodeInfo(): Promise<any> {
    return this.callRpc('admin_nodeInfo');
  }
  
  async getPeers(): Promise<any[]> {
    return this.callRpc('admin_peers');
  }
  
  async getTraceTransaction(txHash: string): Promise<any> {
    return this.callRpc('debug_traceTransaction', [txHash]);
  }
}
