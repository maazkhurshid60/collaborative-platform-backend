
import { io as Client } from "socket.io-client";
import jwt from "jsonwebtoken";

/**
 * SCALABLE LOAD TEST SCRIPT
 * This script simulates multiple concurrent users connecting to the socket server.
 * 
 * Usage: 
 * 1. Ensure the server is running (npm run dev)
 * 2. Set the variables below
 * 3. Run: npx ts-node tests/load-test.ts
 */

const SERVER_URL = "http://localhost:8000";
const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET || "your-secret"; // Must match server
const CLIENT_COUNT = 500; // Increase this to test scaling (e.g. 1000, 5000)
const RAMP_UP_MS = 10;    // Time between each client connection in ms

console.log(`🚀 Starting load test...`);
console.log(`Target: ${SERVER_URL}`);
console.log(`Clients: ${CLIENT_COUNT}`);

let connectedCount = 0;
let errorCount = 0;
let startTimes: Map<string, number> = new Map();

function connectClient(id: number) {
    const userId = `user_${id}`;
    const token = jwt.sign({ id: userId, email: `${userId}@test.com` }, JWT_SECRET, { expiresIn: "1h" });

    const startTime = Date.now();
    const socket = Client(SERVER_URL, {
        auth: { token },
        transports: ["websocket"] // Using websocket directly is faster for load tests
    });

    socket.on("connect", () => {
        connectedCount++;
        const latency = Date.now() - startTime;
        if (connectedCount % 10 === 0 || connectedCount === CLIENT_COUNT) {
            console.log(`[${connectedCount}/${CLIENT_COUNT}] Client ${userId} connected. Latency: ${latency}ms`);
        }
    });

    socket.on("connect_error", (err) => {
        errorCount++;
        console.error(`❌ Client ${userId} failed: ${err.message}`);
    });

    socket.on("disconnect", () => {
        connectedCount--;
    });
}

// Ramp up connections
for (let i = 0; i < CLIENT_COUNT; i++) {
    setTimeout(() => connectClient(i), i * RAMP_UP_MS);
}

// Status reporting
setInterval(() => {
    console.log(`--- Status: ${connectedCount} connected, ${errorCount} failed ---`);
    if (connectedCount === CLIENT_COUNT) {
        console.log("✅ All clients connected successfully!");
        // Keep connections open for a bit to test stability
        setTimeout(() => {
            console.log("Closing all connections...");
            process.exit(0);
        }, 5000);
    }
}, 2000);
