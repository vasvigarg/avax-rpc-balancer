import { BaseNodeAdapter } from './baseNodeAdapter';

export class FantomNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'fantom';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Fantom-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getEpoch(): Promise<number> {
    return this.callRpc('ftm_getEpoch');
  }
  
  async getValidators(): Promise<any[]> {
    return this.callRpc('ftm_getValidators');
  }
  
  async getStakerInfo(address: string): Promise<any> {
    return this.callRpc('ftm_getStakerInfo', [address]);
  }
}