import { getCircuitBreaker, CircuitState } from '../../src/services/circuitBreaker';

describe('CircuitBreaker', () => {
  const nodeId = 'node-1';
  const config = {
    failureThreshold: 3,
    resetTimeout: 1000, // 1s for test
    monitorInterval: 100, // fast polling for test
    successThreshold: 2,
  };

  let circuitBreaker = getCircuitBreaker(config);

  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreaker = getCircuitBreaker(config); // re-initialize singleton
    circuitBreaker.resetCircuit(nodeId);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.CLOSED);
  });

  it('should open circuit after failure threshold is reached', () => {
    for (let i = 0; i < config.failureThreshold; i++) {
      circuitBreaker.recordFailure(nodeId);
    }
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.OPEN);
  });

  it('should transition from OPEN to HALF_OPEN after timeout', () => {
    for (let i = 0; i < config.failureThreshold; i++) {
      circuitBreaker.recordFailure(nodeId);
    }
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.OPEN);

    jest.advanceTimersByTime(config.resetTimeout + 1);
    // Wait for monitorInterval tick to transition
    jest.advanceTimersByTime(config.monitorInterval);

    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.HALF_OPEN);
  });

  it('should close circuit after successThreshold successes in HALF_OPEN', () => {
    // Trigger open → half-open
    for (let i = 0; i < config.failureThreshold; i++) {
      circuitBreaker.recordFailure(nodeId);
    }

    jest.advanceTimersByTime(config.resetTimeout + config.monitorInterval);

    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.HALF_OPEN);

    circuitBreaker.recordSuccess(nodeId);
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.HALF_OPEN);

    circuitBreaker.recordSuccess(nodeId);
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.CLOSED);
  });

  it('should reopen circuit on failure during HALF_OPEN', () => {
    for (let i = 0; i < config.failureThreshold; i++) {
      circuitBreaker.recordFailure(nodeId);
    }

    jest.advanceTimersByTime(config.resetTimeout + config.monitorInterval);

    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.HALF_OPEN);

    circuitBreaker.recordFailure(nodeId);
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.OPEN);
  });

  it('should reset the circuit manually', () => {
    for (let i = 0; i < config.failureThreshold; i++) {
      circuitBreaker.recordFailure(nodeId);
    }

    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.OPEN);

    circuitBreaker.resetCircuit(nodeId);
    expect(circuitBreaker.getCircuitState(nodeId)).toBe(CircuitState.CLOSED);
  });
});
