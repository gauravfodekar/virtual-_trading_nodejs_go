const fastify = require('fastify')({ logger: true });
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Register CORS for frontend integration
fastify.register(require('@fastify/cors'), { origin: '*' });

// Register PostgreSQL connection pool
fastify.register(require('@fastify/postgres'), {
    connectionString: `postgres://${process.env.POSTGRES_USER || 'kite_admin'}:${process.env.POSTGRES_PASSWORD || 'supersecurepassword123'}@localhost:5432/${process.env.POSTGRES_DB || 'trading_platform'}`
});

// Register JWT authentication plugin
fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'supersecret_jwt_key_change_in_production'
});

// Authentication Decorator to protect sensitive routes
fastify.decorate('authenticate', async function (request, reply) {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.code(401).send({ error: 'Unauthorized: Invalid or missing token' });
    }
});

// Register Modular Routes (Auth & Resilient Orders with RabbitMQ)
fastify.register(require('./routes/auth'));
fastify.register(require('./routes/orders'));

// Health check root route
fastify.get('/', async (request, reply) => {
    return { status: 'Virtual Trading Platform API is running successfully with Resilience and RabbitMQ' };
});

// Start Server
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log('🚀 Fastify backend server running at http://localhost:3000');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();