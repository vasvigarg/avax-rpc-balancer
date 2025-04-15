import { BaseNodeAdapter } from './baseNodeAdapter';

export class BinanceChainNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'binance-smart-chain';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Binance Smart Chain-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getValidators(): Promise<any[]> {
    return this.callRpc('bsc_getValidators');
  }
  
  async getValidatorStatus(address: string): Promise<any> {
    return this.callRpc('bsc_getValidatorStatus', [address]);
  }
  
  async getCommittee(): Promise<any[]> {
    return this.callRpc('bsc_getCommittee');
  }
}