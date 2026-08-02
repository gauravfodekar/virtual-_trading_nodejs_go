const bcrypt = require('bcrypt');

async function authRoutes(fastify, options) {
    
    // --- USER REGISTRATION ROUTE ---
    fastify.post('/register', async (request, reply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            return reply.code(400).send({ error: 'Email and password are required' });
        }

        try {
            // Hash the password securely
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            const client = await fastify.pg.connect();
            try {
                await client.query('BEGIN');

                // 1. Insert user into users table
                const userResult = await client.query(
                    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
                    [email, passwordHash]
                );
                const newUser = userResult.rows[0];

                // 2. Initialize a default wallet for the new user with ₹100,000 virtual balance
                await client.query(
                    'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
                    [newUser.id, 100000.00]
                );

                await client.query('COMMIT');

                return reply.code(201).send({
                    status: 'success',
                    message: 'User registered successfully with initial wallet balance',
                    data: { id: newUser.id, email: newUser.email }
                });
            } catch (err) {
                await client.query('ROLLBACK');
                if (err.code === '23505') { // Postgres unique violation error code
                    return reply.code(400).send({ error: 'Email is already registered' });
                }
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error during registration' });
        }
    });

    // --- USER LOGIN ROUTE ---
    fastify.post('/login', async (request, reply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            return reply.code(400).send({ error: 'Email and password are required' });
        }

        try {
            // Find user by email
            const userResult = await fastify.pg.query(
                'SELECT id, email, password_hash FROM users WHERE email = $1',
                [email]
            );

            if (userResult.rows.length === 0) {
                return reply.code(401).send({ error: 'Invalid email or password' });
            }

            const user = userResult.rows[0];

            // Compare submitted password with stored hash
            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            if (!passwordMatch) {
                return reply.code(401).send({ error: 'Invalid email or password' });
            }

            // Generate JWT Token using Fastify JWT plugin
            const token = fastify.jwt.sign({ userId: user.id, email: user.email }, { expiresIn: '24h' });

            return reply.code(200).send({
                status: 'success',
                message: 'Login successful',
                token
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error during login' });
        }
    });

    // --- WALLET BALANCE ROUTE (PROTECTED) ---
    fastify.get('/wallet/balance', { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const userId = request.user.userId;

        try {
            const walletResult = await fastify.pg.query(
                'SELECT id, balance, updated_at FROM wallets WHERE user_id = $1',
                [userId]
            );

            if (walletResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Wallet not found' });
            }

            return reply.code(200).send({
                status: 'success',
                data: walletResult.rows[0]
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error fetching wallet balance' });
        }
    });
}

module.exports = authRoutes;