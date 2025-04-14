import { BaseNodeAdapter } from './baseNodeAdapter';

export class AvalancheNodeAdapter extends BaseNodeAdapter {
  getClientType(): string {
    return 'avalanche';
  }
  
  async getClientVersion(): Promise<string> {
    return this.callRpc('web3_clientVersion');
  }
  
  // Avalanche-specific methods
  async getHeight(): Promise<number> {
    return this.callRpc('eth_blockNumber').then(height => parseInt(height, 16));
  }
  
  async getPlatformHeight(): Promise<number> {
    return this.callRpc('platform.getHeight');
  }
  
  async getStakingAssetID(): Promise<string> {
    return this.callRpc('platform.getStakingAssetID');
  }
  
  async isBootstrapped(chain: string): Promise<boolean> {
    return this.callRpc('info.isBootstrapped', [{ chain }]);
  }
}
