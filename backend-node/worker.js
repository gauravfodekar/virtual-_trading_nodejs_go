const amqp = require('amqplib');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'kite_admin',
    host: 'localhost',
    database: process.env.POSTGRES_DB || 'trading_platform',
    password: process.env.POSTGRES_PASSWORD || 'supersecurepassword123',
    port: 5432,
});

async function startWorker() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        await channel.assertQueue('order_queue', { durable: true });

        console.log('👷 Order Worker is running and listening for messages...');

        channel.consume('order_queue', async (msg) => {
            if (msg !== null) {
                const orderData = JSON.parse(msg.content.toString());
                const { orderId, walletId, totalCost } = orderData;

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    await client.query(
                        'UPDATE wallets SET balance = balance - $1 WHERE id = $2',
                        [totalCost, walletId]
                    );

                    await client.query(
                        'INSERT INTO wallet_transactions (wallet_id, amount, type) VALUES ($1, $2, $3)',
                        [walletId, totalCost, 'DEBIT']
                    );

                    await client.query(
                        'UPDATE orders SET status = $1 WHERE id = $2',
                        ['COMPLETED', orderId]
                    );

                    await client.query('COMMIT');
                    console.log(`✅ Order ${orderId} executed successfully.`);
                    channel.ack(msg);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Failed to execute order ${orderId}:`, error.message);
                    channel.nack(msg, false, true); // Re-queue message
                } finally {
                    client.release();
                }
            }
        });
    } catch (error) {
        console.error('Worker connection error:', error);
    }
}

startWorker();