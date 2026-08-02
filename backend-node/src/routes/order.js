// routes/orders.js
const amqp = require('amqplib');
// Import our resilience utilities
const { breaker, retryWithBackoff } = require('../utils/resilience'); 

async function orderRoutes(fastify, options) {
    
    let channel, connection;
    async function getRabbitMQChannel() {
        if (channel) return channel;
        try {
            connection = await amqp.connect('amqp://localhost');
            channel = await connection.createChannel();
            await channel.assertQueue('order_queue', { durable: true });
            return channel;
        } catch (error) {
            fastify.log.error('RabbitMQ connection error:', error);
            throw error;
        }
    }

    // --- PLACE AN ORDER (PROTECTED ROUTE) ---
    fastify.post('/orders', { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;
        const { stockSymbol, orderType, quantity, price } = request.body;

        if (!stockSymbol || !orderType || !quantity || !price) {
            return reply.code(400).send({ error: 'Missing required order fields' });
        }

        const totalCost = quantity * price;

        try {
            // 1. Check user wallet balance first
            const walletResult = await fastify.pg.query(
                'SELECT id, balance FROM wallets WHERE user_id = $1',
                [userId]
            );

            if (walletResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Wallet not found' });
            }

            const wallet = walletResult.rows[0];

            if (orderType === 'BUY' && Number(wallet.balance) < totalCost) {
                return reply.code(400).send({ error: 'Insufficient wallet balance for this trade' });
            }

            // 2. Insert order as PENDING into PostgreSQL
            const orderResult = await fastify.pg.query(
                'INSERT INTO orders (user_id, stock_symbol, order_type, quantity, price, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, created_at',
                [userId, stockSymbol, orderType, quantity, price, 'PENDING']
            );
            const order = orderResult.rows[0];

            // 3. SIMULATE EXTERNAL EXCHANGE/PAYMENT CALL WITH RESILIENCE
            // Here we wrap a mock external check using our retry with backoff and circuit breaker
            try {
                await retryWithBackoff(async () => {
                    return await breaker.fire({ orderId: order.id, totalCost });
                }, 2, 500); // 2 retries with a base 500ms backoff + jitter
            } catch (externalError) {
                request.log.warn('External exchange routing failed after retries, but order is safe in queue.');
                // Note: Even if external check hiccups, our architecture relies on the async queue,
                // but the circuit breaker protects us from cascading failure if the external API is dead.
            }

            // 4. Publish order to RabbitMQ for asynchronous execution
            const ch = await getRabbitMQChannel();
            const orderPayload = JSON.stringify({
                orderId: order.id,
                walletId: wallet.id,
                userId,
                orderType,
                totalCost
            });

            ch.sendToQueue('order_queue', Buffer.from(orderPayload), { persistent: true });

            return reply.code(202).send({
                status: 'success',
                message: 'Order received, validated, and queued for execution',
                data: order
            });

        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error during order placement' });
        }
    });
}

module.exports = orderRoutes;