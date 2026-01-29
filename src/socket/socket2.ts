import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { verifyToken } from '../utils/tokenUtils';

let io: Server;

// 1. Setup Redis Client (For scaling across multiple servers)
// Using environment variable for Redis URL or default to localhost
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const subClient = pubClient.duplicate();

export function setupSocket(server: any) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://collaborative-platform-frontend.vercel.app',
                "https://www.collaborateme.com/",
                "https://www.collaborateme.com",
            ],
            credentials: true
        },
    });

    // 2. Attach Redis Adapter
    // This allows multiple socket servers to talk to each other
    io.adapter(createAdapter(pubClient, subClient));

    // 3. Middleare: Security Guard (JWT Auth)
    // This runs BEFORE the user is allowed to connect.
    io.use((socket: Socket, next) => {
        try {
            // Client should send token in auth object: io({ auth: { token: "..." } })
            // Fallback to query param if needed: socket.handshake.query.token
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            // Verify Token using our shared utility
            // This throws if invalid
            const decoded = verifyToken(token as string);

            // Attach user data to the socket object so we know who this is
            (socket as any).user = decoded;

            next();
        } catch (err) {
            console.error("Socket Auth Failed:", err);
            next(new Error("Authentication error: Invalid token"));
        }
    });

    console.log("⚡️ Socket.IO initialized with Redis Adapter and JWT Auth");

    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user;
        const userId = user?.id || user?.providerId;

        console.log(`User connected: ${userId} (${user.email})`);

        // 4. Join Personal Room (Lightweight)
        // Used for notifications, direct message alerts, etc.
        if (userId) {
            socket.join(userId.toString());
        }

        /**
         * 5. Lazy Joining (Performance)
         * Don't join 100 chat rooms on connect.
         * Only join when the user actually opens the chat window.
         */
        socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            console.log(`User ${userId} joining chat: ${chatChannelId}`);
            socket.join(chatChannelId);
        });

        socket.on('leave_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            console.log(`User ${userId} leaving chat: ${chatChannelId}`);
            socket.leave(chatChannelId);
        });

        socket.on('disconnect', () => {
            // Redis adapter handles clean up automatically
            console.log(`User disconnected: ${userId}`);
        });
    });
}

// Export io so Controllers can use it
export { io };