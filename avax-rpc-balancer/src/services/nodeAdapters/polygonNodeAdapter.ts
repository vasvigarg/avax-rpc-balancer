import { BaseNodeAdapter } from './baseNodeAdapter';

export class PolygonNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'polygon';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Polygon-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getValidatorInfo(): Promise<any> {
    return this.callRpc('bor_getValidators');
  }
  
  async getSnapshot(): Promise<any> {
    return this.callRpc('bor_getSnapshot');
  }
  
  async getCurrentProposer(): Promise<string> {
    return this.callRpc('bor_getCurrentProposer');
  }
}