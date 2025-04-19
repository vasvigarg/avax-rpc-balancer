import { logger } from '../../utils/logger';

export interface NodeRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params: any[];
}

export interface NodeRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface NodeAdapterConfig {
  url: string;
  timeout?: number;
  headers?: Record<string, string>;
  username?: string;
  password?: string;
  nodeId: string; // Added nodeId property
}

export abstract class BaseNodeAdapter {
  public readonly url: string;
  public readonly nodeId: string;
  protected config: NodeAdapterConfig;
  protected log = logger.withContext({ service: 'node-adapter' });

  constructor(config: NodeAdapterConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
    this.url = this.config.url;
    this.nodeId = this.config.nodeId;
  }

  abstract getClientType(): string;
  abstract getClientVersion(): Promise<string>;

  async callRpc(method: string, params: any[] = []): Promise<any> {
    const request: NodeRpcRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    try {
      const response = await this.makeRequest(request);
      if (response.error) {
        throw new Error(`RPC Error: ${response.error.message} (${response.error.code})`);
      }
      return response.result;
    } catch (error) {
      this.log.error(`RPC call failed for ${method}: ${error}`);
      throw error;
    }
  }

  protected async makeRequest(request: NodeRpcRequest): Promise<NodeRpcResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Add authentication if provided
    if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
        'base64',
      );
      headers['Authorization'] = `Basic ${auth}`;
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as NodeRpcResponse;
    } catch (error) {
      this.log.error(`Request failed to ${this.config.url}: ${error}`);
      throw error;
    }
  }
}
