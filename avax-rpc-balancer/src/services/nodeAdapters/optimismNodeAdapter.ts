import { BaseNodeAdapter } from './baseNodeAdapter';

export class OptimismNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'optimism';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Optimism-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getL1GasPrice(): Promise<string> {
    return this.callRpc('rollup_gasPrices');
  }
  
  async getSyncStatus(): Promise<any> {
    return this.callRpc('optimism_syncStatus');
  }
  
  async getL1BlockNumber(): Promise<number> {
    return this.callRpc('eth_getL1BlockNumber').then(blockNum => parseInt(blockNum, 16));
  }
}