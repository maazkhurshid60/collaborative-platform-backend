import { createServer } from "http";
import { AddressInfo } from "net";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { setupSocket } from "../socket2";
import jwt from "jsonwebtoken";

// Mock Redis to avoid needing a real server for these tests
jest.mock("ioredis", () => {
    const Redis = require("ioredis-mock");
    return Redis;
});

describe("Socket2 Integration Tests", () => {
    let io: any, server: any, port: number;
    let jwtSecret = process.env.ACCESS_TOKEN_SECRET || "test-secret";

    beforeAll((done) => {
        process.env.ACCESS_TOKEN_SECRET = jwtSecret;
        server = createServer();
        setupSocket(server);
        server.listen(() => {
            port = (server.address() as AddressInfo).port;
            done();
        });
    });

    afterAll(() => {
        server.close();
    });

    test("should fail connection without token", (done) => {
        const clientSocket = Client(`http://localhost:${port}`);
        clientSocket.on("connect_error", (err) => {
            expect(err.message).toBe("Authentication error: No token provided");
            clientSocket.close();
            done();
        });
    });

    test("should fail connection with invalid token", (done) => {
        const clientSocket = Client(`http://localhost:${port}`, {
            auth: { token: "invalid-token" }
        });
        clientSocket.on("connect_error", (err) => {
            expect(err.message).toBe("Authentication error: Invalid token");
            clientSocket.close();
            done();
        });
    });

    test("should connect with valid token", (done) => {
        const token = jwt.sign({ id: "user123", email: "test@example.com" }, jwtSecret, { expiresIn: "1h" });
        const clientSocket = Client(`http://localhost:${port}`, {
            auth: { token }
        });

        clientSocket.on("connect", () => {
            expect(clientSocket.connected).toBe(true);
            clientSocket.close();
            done();
        });
    });

    test("should join a chat channel", (done) => {
        const token = jwt.sign({ id: "user123", email: "test@example.com" }, jwtSecret, { expiresIn: "1h" });
        const clientSocket = Client(`http://localhost:${port}`, {
            auth: { token }
        });

        clientSocket.on("connect", () => {
            clientSocket.emit("join_channel", { chatChannelId: "channel-456" });
            // In a real test, you might verify if the server joined the room
            // by emitting an event back or checking server-side state if accessible.
            // For this test, we just verify the event can be sent without error.
            setTimeout(() => {
                clientSocket.close();
                done();
            }, 100);
        });
    });
});
