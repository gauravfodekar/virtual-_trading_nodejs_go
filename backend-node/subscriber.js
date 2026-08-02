// subscriber.js
const { createClient } = require('redis');

async function startSubscriber() {
    // Create a Redis client
    const subscriber = createClient({
        url: 'redis://localhost:6379'
    });

    subscriber.on('error', (err) => console.error('Redis Client Error', err));

    await subscriber.connect();
    console.log('🔌 Node.js Subscriber connected to Redis.');

    // Subscribe to the "market_ticks" channel broadcasted by Go
    await subscriber.subscribe('market_ticks', (message) => {
        const tick = JSON.parse(message);
        console.log(`📥 Received Live Tick -> [${tick.symbol}] : ₹${tick.price} at ${new Date(tick.timestamp).toLocaleTimeString()}`);
    });
}

startSubscriber().catch(console.error);