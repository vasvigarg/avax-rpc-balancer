import { BaseNodeAdapter } from './baseNodeAdapter';

export class ArbitrumNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'arbitrum';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Arbitrum-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getL1BlockNumber(): Promise<number> {
    return this.callRpc('eth_getL1BlockNumber').then(blockNum => parseInt(blockNum, 16));
  }
  
  async getL1GasPrice(): Promise<string> {
    return this.callRpc('eth_getL1GasPrice');
  }
  
  async getArbGasInfo(): Promise<any> {
    return this.callRpc('eth_arbGasInfo');
  }
}