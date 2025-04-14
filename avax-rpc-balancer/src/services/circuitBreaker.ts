import { logger } from '../utils/logger';
const log = logger.withContext({ service: 'circuit-breaker' });

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening the circuit
  resetTimeout: number;         // Time in milliseconds before attempting to half-open
  monitorInterval: number;      // Time in milliseconds between checking circuit states
  successThreshold: number;     // Number of successes needed to close a half-open circuit
}

export enum CircuitState {
  CLOSED = 'CLOSED',            // Normal operation - requests pass through
  OPEN = 'OPEN',                // Circuit is open - requests fail fast
  HALF_OPEN = 'HALF_OPEN'       // Testing if the service is healthy again
}

export interface CircuitStats {
  failures: number;             // Count of consecutive failures
  successes: number;            // Count of consecutive successes
  lastFailure: number | null;   // Timestamp of last failure
  lastSuccess: number | null;   // Timestamp of last success
  openedAt: number | null;      // When the circuit was opened
  state: CircuitState;          // Current state
  totalFailures: number;        // Total recorded failures
  totalSuccesses: number;       // Total recorded successes
}

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,          // Open after 5 consecutive failures
  resetTimeout: 30000,          // Try to recover after 30 seconds
  monitorInterval: 5000,        // Check circuit status every 5 seconds
  successThreshold: 2           // Close after 2 consecutive successes in half-open state
};

export class CircuitBreaker {
  private circuits: Map<string, CircuitStats>;
  private config: CircuitBreakerConfig;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.circuits = new Map<string, CircuitStats>();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startMonitoring();
  }

  /**
   * Initialize a circuit for a specific node
   */
  public initCircuit(nodeId: string): void {
    if (!this.circuits.has(nodeId)) {
      this.circuits.set(nodeId, {
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null,
        openedAt: null,
        state: CircuitState.CLOSED,
        totalFailures: 0,
        totalSuccesses: 0
      });
    }
  }

  /**
   * Check if requests to a node should be allowed
   */
  public isAllowed(nodeId: string): boolean {
    this.ensureCircuitExists(nodeId);
    const circuit = this.circuits.get(nodeId)!;

    if (circuit.state === CircuitState.CLOSED) {
      return true;
    }

    if (circuit.state === CircuitState.OPEN) {
      // Check if it's time to transition to half-open
      const now = Date.now();
      if (circuit.openedAt && now - circuit.openedAt >= this.config.resetTimeout) {
        this.transitionToHalfOpen(nodeId);
        return true; // Allow one test request
      }
      return false;
    }

    // In HALF_OPEN state, limit requests to test recovery
    return circuit.successes < this.config.successThreshold;
  }

  /**
   * Record a successful request to a node
   */
  public recordSuccess(nodeId: string): void {
    this.ensureCircuitExists(nodeId);
    const circuit = this.circuits.get(nodeId)!;
    const now = Date.now();

    circuit.successes++;
    circuit.failures = 0;
    circuit.lastSuccess = now;
    circuit.totalSuccesses++;

    // Check if we should close the circuit
    if (circuit.state === CircuitState.HALF_OPEN && circuit.successes >= this.config.successThreshold) {
      this.closeCircuit(nodeId);
    }

    this.circuits.set(nodeId, circuit);
  }

  /**
   * Record a failed request to a node
   */
  public recordFailure(nodeId: string): void {
    this.ensureCircuitExists(nodeId);
    const circuit = this.circuits.get(nodeId)!;
    const now = Date.now();

    circuit.failures++;
    circuit.successes = 0;
    circuit.lastFailure = now;
    circuit.totalFailures++;

    // Check if we should open the circuit
    if (circuit.state === CircuitState.CLOSED && circuit.failures >= this.config.failureThreshold) {
      this.openCircuit(nodeId);
    } else if (circuit.state === CircuitState.HALF_OPEN) {
      // If fails during half-open, go back to open
      this.openCircuit(nodeId);
    }

    this.circuits.set(nodeId, circuit);
  }

  /**
   * Get the current state of a circuit
   */
  public getCircuitState(nodeId: string): CircuitState {
    this.ensureCircuitExists(nodeId);
    return this.circuits.get(nodeId)!.state;
  }

  /**
   * Get detailed stats for a circuit
   */
  public getCircuitStats(nodeId: string): CircuitStats {
    this.ensureCircuitExists(nodeId);
    return this.circuits.get(nodeId)!;
  }

  /**
   * Reset a circuit to closed state
   */
  public resetCircuit(nodeId: string): void {
    this.ensureCircuitExists(nodeId);
    log.info(`Manually resetting circuit for node: ${nodeId}`);
    
    const circuit = this.circuits.get(nodeId)!;
    const { totalFailures, totalSuccesses } = circuit;
    
    this.circuits.set(nodeId, {
      failures: 0,
      successes: 0,
      lastFailure: circuit.lastFailure,
      lastSuccess: circuit.lastSuccess,
      openedAt: null,
      state: CircuitState.CLOSED,
      totalFailures,  // Preserve metrics
      totalSuccesses  // Preserve metrics
    });
  }

  /**
   * Get all circuit breakers and their states
   */
  public getAllCircuits(): Map<string, CircuitStats> {
    return new Map(this.circuits);
  }

  /**
   * Stop the circuit breaker monitoring
   */
  public shutdown(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Ensure a circuit exists for the specified node
   */
  private ensureCircuitExists(nodeId: string): void {
    if (!this.circuits.has(nodeId)) {
      this.initCircuit(nodeId);
    }
  }

  /**
   * Transition a circuit to the open state
   */
  private openCircuit(nodeId: string): void {
    const circuit = this.circuits.get(nodeId)!;
    circuit.state = CircuitState.OPEN;
    circuit.openedAt = Date.now();
    this.circuits.set(nodeId, circuit);
    log.warn(`Circuit opened for node: ${nodeId} after ${circuit.failures} consecutive failures`);
  }

  /**
   * Transition a circuit to the half-open state
   */
  private transitionToHalfOpen(nodeId: string): void {
    const circuit = this.circuits.get(nodeId)!;
    circuit.state = CircuitState.HALF_OPEN;
    circuit.successes = 0;
    this.circuits.set(nodeId, circuit);
    log.info(`Circuit half-opened for node: ${nodeId}, testing recovery`);
  }

  /**
   * Close a circuit
   */
  private closeCircuit(nodeId: string): void {
    const circuit = this.circuits.get(nodeId)!;
    circuit.state = CircuitState.CLOSED;
    circuit.failures = 0;
    circuit.openedAt = null;
    this.circuits.set(nodeId, circuit);
    log.info(`Circuit closed for node: ${nodeId} after recovery`);
  }

  /**
   * Start the circuit monitoring process
   */
  private startMonitoring(): void {
    this.monitorInterval = setInterval(() => {
      // Check for circuits that should transition from OPEN to HALF_OPEN
      const now = Date.now();
      for (const [nodeId, circuit] of this.circuits.entries()) {
        if (
          circuit.state === CircuitState.OPEN &&
          circuit.openedAt &&
          now - circuit.openedAt >= this.config.resetTimeout
        ) {
          this.transitionToHalfOpen(nodeId);
        }
      }
    }, this.config.monitorInterval);
  }
}

// Create a singleton instance
let circuitBreakerInstance: CircuitBreaker | null = null;

/**
 * Get the circuit breaker instance
 */
export function getCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new CircuitBreaker(config);
  }
  return circuitBreakerInstance;
}