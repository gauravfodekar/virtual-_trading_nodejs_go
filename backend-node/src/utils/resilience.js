// utils/resilience.js
const CircuitBreaker = require('opossum');

// A sample async function that simulates calling an unstable external service
async function unstableExternalServiceCall(payload) {
    // Simulating a random network failure or timeout
    if (Math.random() < 0.6) { // 60% chance of failure for testing
        throw new Error('External service timeout or failure');
    }
    return { status: 'success', data: payload };
}

// Circuit Breaker Options
const options = {
    timeout: 3000,          // If the function takes longer than 3 seconds, trigger a failure
    errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
    resetTimeout: 10000     // After 10 seconds, try a test request to see if the service recovered
};

const breaker = new CircuitBreaker(unstableExternalServiceCall, options);

// Circuit Breaker Event Listeners for Monitoring
breaker.on('open', () => console.warn('⚠️ [CIRCUIT BREAKER] Circuit is OPEN! Falling back...'));
breaker.on('halfOpen', () => console.log('🔄 [CIRCUIT BREAKER] Circuit is HALF-OPEN. Testing recovery...'));
breaker.on('close', () => console.log('✅ [CIRCUIT BREAKER] Circuit is CLOSED. Service restored.'));

// Helper function for Retry with Exponential Backoff and Jitter
async function retryWithBackoff(fn, retries = 3, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        
        // Calculate exponential backoff with random jitter (prevents thundering herd)
        const jitter = Math.random() * 500;
        const nextDelay = delay * 2 + jitter;
        
        console.warn(`⚠️ Operation failed. Retrying in ${Math.round(nextDelay)}ms... (${retries} attempts left)`);
        
        await new Promise((resolve) => setTimeout(resolve, nextDelay));
        return retryWithBackoff(fn, retries - 1, nextDelay);
    }
}

module.exports = { breaker, retryWithBackoff };


//sample example usage of the circuit breaker and retry mechanism
/**
 * const { breaker, retryWithBackoff } = require('./utils/resilience');

async function executeExternalTrade(orderData) {
    try {
        // We wrap the call in retry logic, and fallback to the circuit breaker
        return await retryWithBackoff(async () => {
            return await breaker.fire(orderData);
        }, 3, 1000);
    } catch (error) {
        console.error('❌ All retries and circuit breaker protections failed:', error.message);
        throw new Error('Service temporarily unavailable. Please try again later.');
    }
}
 */