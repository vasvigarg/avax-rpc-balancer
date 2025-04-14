/**
 * Individual node health information
 */
export interface NodeHealthInfo {
    id: string;
    url: string;
    network: string;
    healthy: boolean;
    responseTime: number;
    avgResponseTime: number;
    successRate: number;
    score: number;
    lastChecked: string;
    lastStatusChange: string;
  }
  
  /**
   * Complete health report
   */
  export interface HealthReport {
    totalNodes: number;
    healthyNodes: number;
    unhealthyNodes: number;
    avgResponseTime: number;
    nodes: Record<string, NodeHealthInfo>;
  }
  
  /**
   * Admin action request
   */
  export interface AdminActionRequest {
    nodeId: string;
    action: 'enable' | 'disable' | 'reset';
  }