
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Common fix for RDS
});

async function testConnection() {
    console.log('Testing connection to:', process.env.DATABASE_URL?.split('@')[1]);
    try {
        const client = await pool.connect();
        console.log('✅ Successfully connected to the database!');
        const res = await client.query('SELECT current_database(), current_user');
        console.log('Result:', res.rows[0]);
        client.release();
    } catch (err) {
        console.error('❌ Connection failed:', err);
    } finally {
        await pool.end();
    }
}

testConnection();
