import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import logger from "../utils/logger";
import prisma from "../db/db.config";
import { AppointmentStatus, AppointmentSessionType } from "../generated/prisma/enums";
import { CALL_GRACE_MINUTES, getIceServers, isWithinCallJoinWindow, verifyCallToken } from "../utils/callAuth";

// ─── Video call signaling (self-hosted WebRTC) ──────────────────────────────
// Room name alone (`call_${appointmentId}`) is guessable/enumerable, so it is
// NOT sufficient to join — every join_call re-verifies the join token, the
// appointment's real status, and the time window server-side. See
// VIDEO_CALLING_AND_NOTIFICATIONS_PLAN.md §2 for the full rationale.

interface CallAuthResult {
    role: "guest" | "provider";
    participantId: string;
    endTime: Date;
    guestName?: string;
}

async function authorizeCallJoin(appointmentId: string, token: string | undefined): Promise<CallAuthResult | null> {
    if (!token) return null;

    const payload = verifyCallToken(token);
    if (!payload || payload.appointmentId !== appointmentId) return null;

    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { provider: true, bookingProvider: true },
    });
    if (!appointment) return null;
    if (appointment.status !== AppointmentStatus.CONFIRMED) return null;
    if (appointment.sessionType !== AppointmentSessionType.ONLINE) return null;
    if (!isWithinCallJoinWindow(appointment.startTime, appointment.endTime)) return null;

    if (payload.role === "provider") {
        const isHost = payload.participantId === appointment.provider.userId;
        const isBookingProvider = appointment.bookingProvider && payload.participantId === appointment.bookingProvider.userId;
        if (!isHost && !isBookingProvider) return null;
    }

    return {
        role: payload.role,
        participantId: payload.participantId,
        endTime: appointment.endTime,
        guestName: appointment.guestName || "Guest",
    };
}

async function logCallEvent(
    appointmentId: string,
    role: "guest" | "provider",
    participantId: string,
    event: "join" | "leave" | "expired" | "auth_failed" | "completed" | "missed" | "declined",
    durationSeconds?: number,
) {
    try {
        await prisma.appointmentCallLog.create({
            data: {
                appointmentId,
                role,
                participantId,
                event,
                durationSeconds: durationSeconds ?? null,
            },
        });
    } catch (err: any) {
        logger.error(`Failed to write call log (${event}) for appointment ${appointmentId}: ${err.message}`);
    }
}

// Rooms currently believed active, so the periodic sweep below only has to
// check rooms that actually had a join — not scan the whole appointments
// table every tick. Purely a local optimization; the sweep re-derives the
// authoritative "should this be ended" answer from the DB regardless.
const activeCallRooms = new Map<string, { appointmentId: string; endTime: Date }>();

// Enforces call end server-side, not just at the join gate — two participants
// already on a call shouldn't be able to run it indefinitely past the
// scheduled end. Runs on every instance; harmless if redundant (ending an
// already-empty room is a no-op).
function startCallExpirySweep(io: Server) {
    setInterval(async () => {
        const graceMs = CALL_GRACE_MINUTES * 60000;
        const now = Date.now();

        for (const [room, info] of activeCallRooms) {
            if (info.endTime.getTime() + graceMs > now) continue;

            try {
                const sockets = await io.in(room).fetchSockets();
                for (const s of sockets) {
                    const participant = (s.data as { callParticipant?: CallAuthResult }).callParticipant;
                    if (participant) {
                        await logCallEvent(info.appointmentId, participant.role, participant.participantId, "expired");
                    }
                    s.leave(room);
                }
                if (sockets.length > 0) {
                    io.to(room).emit("call_expired", { reason: "endTime_exceeded" });
                }
            } catch (err: any) {
                logger.error(`Call expiry sweep failed for room ${room}: ${err.message}`);
            }

            activeCallRooms.delete(room);
        }
    }, 60000);
}



/*
Let Create a Server
*/
let io: Server;



/* 
For Redis we need the Redis url either form the aws or upstash
*/
const pubClient = new Redis(process.env.REDIS_URL!)
const subClient = pubClient.duplicate(); // This should create the same instance with the same all option the curently first have


pubClient.on("error", (err) => logger.error(`Redis pubClient error: ${err.message} `));
subClient.on("error", (err) => logger.error(`Redis  subClient error: ${err.message}`));


export function setupSocket(server: any) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://collaborative-platform-frontend.vercel.app',
                "https://www.collaborateme.com/",
                "https://www.collaborateme.com",
                "https://app.kolabme.com",
                'http://localhost:3000',
                'https://kolabme.com',
                'https://www.kolabme.com',
            ],
            credentials: true,
        },

        // Required for load balencer combatability
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
    });


    /* 
    We attach the  Redis so that it sync socket events across multiple servers
    */
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Redis apdapter is ready, socket.io is now spreading in multi servers");

    startCallExpirySweep(io);

    io.on("connection", async (socket: any) => {
        const providerId = socket.handshake.query.providerId;
        const userId = socket.handshake.query.userId;

        logger.info(`Connected: sockeetId=${socket.id}, userId=${userId}, providerId=${providerId}`);


        /* 
        Personal Rooms
        These rooms are synced across server via Redis autometically
        */

        if (userId) {
            socket.join(`notification_room_${userId.toString()}`);
            logger.info(`User Joined Notification Room : ${userId}`)
        }

        if (providerId) {
            socket.join(providerId.toString());
            logger.info(`Provider Joined Room: ${providerId}`)
        }



        /* 
        Leaving  Or Joining Channel
        */

        socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            logger.debug(`Socket ${socket.id} joining channel: ${chatChannelId}`);
            socket.join(chatChannelId);
        });

        socket.on('leave_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            logger.debug(`Socket ${socket.id} leaving channel: ${chatChannelId}`);
            socket.leave(chatChannelId);
        });



        /*
        Direct Message
        io.to()
        */
        socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
            try {
                socket.join(message.chatChannelId);


                // Broadcasts to ALL servers via Redis Pub/Sub
                io.to(message.chatChannelId).emit('receive_direct', { ...message });

                // Notify receiver on whichever server they're connected to
                io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

            } catch (err: any) {
                logger.error(`Error in send_direct: ${err.message}`);
            }
        });


        // === Group Message
        socket.on('send_group', ({ message }: { message: any }) => {
            try {
                socket.join(message.groupId);

                // Redis ensures all servers broadcast to their connected clients
                io.to(message.groupId).emit('receive_group', message);

                logger.debug('Group message emitted via Redis Pub/Sub');
            } catch (err: any) {
                logger.error(`Error in send_group: ${err.message}`);
            }
        });



        socket.on('delete_direct_message', ({ chatChannelId, messageId }: { chatChannelId: string, messageId: string }) => {
            try {
                io.to(chatChannelId).emit('message_deleted', { messageId });
            } catch (err: any) {
                logger.error(`Error in delete_direct_message: ${err.message}`);
            }
        });

        // ─── Delete Chat Channel ─────────────────────────────────────
        socket.on('delete_chat_channel', ({ chatChannelId, providerId: pId }: { chatChannelId: string, providerId: string }) => {
            try {
                io.to(pId).emit('chat_channel_deleted', { chatChannelId });
            } catch (err: any) {
                logger.error(`Error in delete_chat_channel: ${err.message}`);
            }
        });

        // ─── Video call signaling (self-hosted WebRTC) ───────────────────
        // 1:1 only (provider ↔ guest) — no SFU needed. Every join re-verifies
        // the token, appointment status, and time window; knowing the room
        // name alone is never sufficient.
        // ─── Video call signaling (self-hosted WebRTC) ───────────────────
        // 1:1 only (provider ↔ guest). Every join re-verifies the token,
        // appointment status, and time window. Guests enter a Waiting Room
        // until the Provider explicitly admits them via `admit_guest`.
        socket.on('join_call', async ({ appointmentId, token }: { appointmentId: string; token?: string }) => {
            try {
                const auth = await authorizeCallJoin(appointmentId, token);
                if (!auth) {
                    socket.emit('call_error', { message: 'Unable to join this call.' });
                    logCallEvent(appointmentId, 'guest', 'unknown', 'auth_failed');
                    return;
                }

                const room = `call_${appointmentId}`;
                const waitingRoom = `waiting_room_${appointmentId}`;
                socket.data.callParticipant = auth;

                // --- PROVIDER JOIN FLOW ---
                if (auth.role === 'provider') {
                    socket.join(room);
                    activeCallRooms.set(room, { appointmentId, endTime: auth.endTime });

                    const { iceServers, turnCredentials } = getIceServers(appointmentId, auth.participantId);
                    if (!turnCredentials) {
                        logger.warn('TURN_SHARED_SECRET not set — falling back to STUN-only ICE servers for local/dev testing.');
                    }
                    socket.emit('call_authorized', { turnCredentials, iceServers });
                    socket.emit('call_joined', { turnCredentials, iceServers });

                    // Check if another participant is already in this call room
                    const roomSockets = await io.in(room).fetchSockets();
                    if (roomSockets.length > 1) {
                        // Notify existing peer(s) in the room to initiate WebRTC offer exchange
                        socket.to(room).emit('peer_joined', { iceServers });
                    }

                    // Check if any guest is currently in the waiting room for this call
                    const waitingSockets = await io.in(waitingRoom).fetchSockets();
                    if (waitingSockets.length > 0) {
                        const guestSocket = waitingSockets[0];
                        const guestAuth = (guestSocket.data as { callParticipant?: CallAuthResult }).callParticipant;
                        socket.emit('guest_waiting_approval', {
                            socketId: guestSocket.id,
                            guestName: guestAuth?.guestName || 'Guest',
                            appointmentId,
                        });
                    }

                    logCallEvent(appointmentId, auth.role, auth.participantId, 'join');
                    return;
                }

                socket.on("call_ringing", ({ appointmentId }: { appointmentId: string }) => {
                    const room = `call_${appointmentId}`;
                    io.to(room).emit("target_ringing", { appointmentId });
                });

                // --- GUEST JOIN FLOW (Enters Waiting Room) ---
                socket.join(waitingRoom);
                socket.emit('guest_waiting_approval_pending', {
                    message: 'Waiting for the provider to admit you into the call...',
                });

                // Notify provider in `room` if they are already in the call
                const providerSockets = await io.in(room).fetchSockets();
                if (providerSockets.length > 0) {
                    io.to(room).emit('guest_waiting_approval', {
                        socketId: socket.id,
                        guestName: auth.guestName || 'Guest',
                        appointmentId,
                    });
                }
            } catch (err: any) {
                logger.error(`Error in join_call: ${err.message}`);
                socket.emit('call_error', { message: 'Unable to join this call.' });
            }
        });

        // Provider admits a waiting guest into the active call room
        socket.on('admit_guest', async ({ appointmentId, guestSocketId }: { appointmentId: string; guestSocketId: string }) => {
            try {
                const room = `call_${appointmentId}`;
                const waitingRoom = `waiting_room_${appointmentId}`;
                const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;

                if (!participant || participant.role !== 'provider' || !socket.rooms.has(room)) {
                    return;
                }

                const guestSocket = io.sockets.sockets.get(guestSocketId);
                if (!guestSocket) return;

                const guestAuth = (guestSocket.data as { callParticipant?: CallAuthResult }).callParticipant;
                if (!guestAuth) return;

                // Move guest from waiting room to active call room
                guestSocket.leave(waitingRoom);
                guestSocket.join(room);

                const { iceServers, turnCredentials } = getIceServers(appointmentId, guestAuth.participantId);
                guestSocket.emit('call_admitted', {});
                guestSocket.emit('call_authorized', { turnCredentials, iceServers });

                // Notify provider in `room` (except the admitted guest) so WebRTC offer creation begins
                socket.to(room).emit('peer_joined', {});
                logCallEvent(appointmentId, guestAuth.role, guestAuth.participantId, 'join');
            } catch (err: any) {
                logger.error(`Error in admit_guest: ${err.message}`);
            }
        });

        // Provider denies entry to a waiting guest
        socket.on('deny_guest', async ({ appointmentId, guestSocketId }: { appointmentId: string; guestSocketId: string }) => {
            try {
                const room = `call_${appointmentId}`;
                const waitingRoom = `waiting_room_${appointmentId}`;
                const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;

                if (!participant || participant.role !== 'provider' || !socket.rooms.has(room)) {
                    return;
                }

                const guestSocket = io.sockets.sockets.get(guestSocketId);
                if (!guestSocket) return;

                const guestAuth = (guestSocket.data as { callParticipant?: CallAuthResult }).callParticipant;
                if (guestAuth) {
                    logCallEvent(appointmentId, guestAuth.role, guestAuth.participantId, 'declined');
                }

                guestSocket.emit('call_denied', { message: 'The host has denied your request to join.' });
                guestSocket.leave(waitingRoom);
            } catch (err: any) {
                logger.error(`Error in deny_guest: ${err.message}`);
            }
        });

        socket.on('call_missed', ({ appointmentId }: { appointmentId: string }) => {
            const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;
            if (participant) {
                logCallEvent(appointmentId, participant.role, participant.participantId, 'missed');
            }
        });

        socket.on('webrtc_offer', ({ appointmentId, sdp }: { appointmentId: string; sdp: unknown }) => {
            const room = `call_${appointmentId}`;
            if (!socket.rooms.has(room)) return;
            socket.to(room).emit('webrtc_offer', { sdp });
        });

        socket.on('webrtc_answer', ({ appointmentId, sdp }: { appointmentId: string; sdp: unknown }) => {
            const room = `call_${appointmentId}`;
            if (!socket.rooms.has(room)) return;
            socket.to(room).emit('webrtc_answer', { sdp });
        });

        socket.on('ice_candidate', ({ appointmentId, candidate }: { appointmentId: string; candidate: unknown }) => {
            const room = `call_${appointmentId}`;
            if (!socket.rooms.has(room)) return;
            socket.to(room).emit('ice_candidate', { candidate });
        });

        socket.on('leave_call', ({ appointmentId, durationSeconds }: { appointmentId: string; durationSeconds?: number }) => {
            const room = `call_${appointmentId}`;
            const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;
            if (participant) {
                if (durationSeconds && durationSeconds > 0) {
                    logCallEvent(appointmentId, participant.role, participant.participantId, 'completed', durationSeconds);
                } else {
                    logCallEvent(appointmentId, participant.role, participant.participantId, 'leave');
                }
            }
            // Tell whoever is still in the room the call is over
            socket.to(room).emit('call_ended', { reason: 'ended_by_peer' });
            socket.leave(room);
        });

        // ─── Screen-share approval (guest must be admitted by the provider) ──
        // The provider (host) is the call authority: they can start sharing
        // immediately, and only they can approve/deny a guest's request. Both
        // checks are re-verified here against socket.data.callParticipant —
        // set once at join_call time — never trusted from the client alone.
        socket.on('screen_share_request', ({ appointmentId }: { appointmentId: string }) => {
            const room = `call_${appointmentId}`;
            const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;
            if (!participant || participant.role !== 'guest' || !socket.rooms.has(room)) return;
            socket.to(room).emit('screen_share_requested', {});
        });

        socket.on('screen_share_response', ({ appointmentId, approved }: { appointmentId: string; approved: boolean }) => {
            const room = `call_${appointmentId}`;
            const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;
            if (!participant || participant.role !== 'provider' || !socket.rooms.has(room)) return;
            socket.to(room).emit('screen_share_response', { approved });
        });

        socket.on('screen_share_started', ({ appointmentId }: { appointmentId: string }) => {
            const room = `call_${appointmentId}`;
            if (!socket.rooms.has(room)) return;
            socket.to(room).emit('screen_share_started', {});
        });

        socket.on('screen_share_stopped', ({ appointmentId }: { appointmentId: string }) => {
            const room = `call_${appointmentId}`;
            if (!socket.rooms.has(room)) return;
            socket.to(room).emit('screen_share_stopped', {});
        });


        /*
        In the end we disconnect the socket 
        */

        // Fires before Socket.IO removes the socket from its rooms, so
        // `socket.rooms` still tells us which active call (if any) this
        // socket was in — covers a closed tab/crash/dropped network where
        // the client never gets a chance to emit `leave_call`.
        socket.on('disconnecting', () => {
            const participant = (socket.data as { callParticipant?: CallAuthResult }).callParticipant;
            if (!participant) return;

            for (const room of socket.rooms) {
                if (!room.startsWith('call_')) continue;
                const appointmentId = room.slice('call_'.length);
                logCallEvent(appointmentId, participant.role, participant.participantId, 'leave');
                socket.to(room).emit('call_ended', { reason: 'ended_by_peer' });
            }
        });

        socket.on('disconnect', () => {
            logger.info(`Disconnected | providerId: ${providerId},userId: ${userId}`)
        })

    })

}


export { io };










// import { Server } from 'socket.io';
// import prisma from '../db/db.config';
// import logger from '../utils/logger';

// let io: Server;

// export function setupSocket(server: any) {
//     io = new Server(server, {
//         cors: {
//             origin: [
//                 'http://localhost:5173',
//                 'https://collaborative-platform-frontend.vercel.app',
//                 "https://www.collaborateme.com/",
//                 "https://www.collaborateme.com",
//                 "https://app.kolabme.com"
//             ],
//         },
//     });


//     io.on('connection', async (socket: any) => {
//         const providerId = socket.handshake.query.providerId;
//         const userId = socket.handshake.query.userId;

//         logger.info(`🔌 New connection: socketId=${socket.id}, userId=${userId}, providerId=${providerId}`);

//         // Join UNIQUE notification room
//         if (userId) {
//             socket.join(`notification_room_${userId.toString()}`);
//             logger.info(`👥 User joined notification room: ${userId}`);
//         }

//         // Provider personal room for legacy events
//         if (providerId) {
//             socket.join(providerId.toString());
//             logger.info(`👥 Provider joined room: ${providerId}`);
//         }


//         // Direct message
//         // socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
//         //     try {
//         //         // 🛠️ Ensure the sender is also joined to the room
//         //         socket.join(message.chatChannelId); // ✅ This is key fix

//         //         // // ✅ Broadcast message to everyone in the room (sender + receiver)
//         //         // const decryptedMessage = {
//         //         //     ...message,
//         //         //     message: decryptText(message.message),
//         //         // };
//         //         io.to(message?.chatChannelId).emit('receive_direct', message.message);

//         //         // 🔄 Unread refresh still sent to receiver only
//         //         io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

//         //     } catch (err) {
//         //         console.error('Error sending direct message:', err);
//         //     }
//         // });

//         socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
//             try {
//                 // sender ko room me pakka join kara do
//                 socket.join(message.chatChannelId);

//                 // Plaintext object hi aayega (aap REST response me decrypt kar ke bhej chuke ho)
//                 const plainMessage = {
//                     ...message, // id, senderId, chatChannelId, createdAt, sender, etc.
//                     // message already plaintext from API response
//                 };

//                 io.to(message.chatChannelId).emit('receive_direct', {
//                     ...message, // id, senderId, chatChannelId, createdAt, sender, etc.
//                 });

//                 // Unread refresh receiver ko
//                 io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

//             } catch (err: any) {
//                 logger.error(`Error sending direct message: ${err.message}`);
//             }
//         });

//         // Join direct chat room
//         socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
//             logger.debug(`Socket ${socket.id} joining ROOM: ${chatChannelId}`);
//             socket.join(chatChannelId);
//         });

//         // Group message
//         // socket.on('send_group', ({ message }: { message: any }) => {
//         //     try {
//         //         io.to(message.groupId).emit('receive_group', message);
//         //         console.log('Group message emitted:', message);
//         //     } catch (err) {
//         //         console.error('Error in send_group:', err);
//         //     }
//         // });
//         socket.on('send_group', ({ message }: { message: any }) => {
//             try {
//                 // ✅ Ensure the sender is joined to the group room
//                 socket.join(message.groupId); // 🔑 Important for sender to also receive the message

//                 // ✅ Emit message to everyone in the group
//                 io.to(message.groupId).emit('receive_group', message);

//                 logger.debug('Group message emitted');
//             } catch (err: any) {
//                 logger.error(`Error in send_group: ${err.message}`);
//             }
//         });

//         // Delete direct message
//         socket.on('delete_direct_message', ({ chatChannelId, messageId }: { chatChannelId: string, messageId: string }) => {
//             try {
//                 io.to(chatChannelId).emit('message_deleted', { messageId });
//             } catch (err: any) {
//                 logger.error(`Error in delete_direct_message: ${err.message}`);
//             }
//         });

//         // Delete chat channel (hide for current user)
//         socket.on('delete_chat_channel', ({ chatChannelId, providerId }: { chatChannelId: string, providerId: string }) => {
//             try {
//                 // Notify all sessions of the same provider
//                 io.to(providerId).emit('chat_channel_deleted', { chatChannelId });
//             } catch (err: any) {
//                 logger.error(`Error in delete_chat_channel: ${err.message}`);
//             }
//         });


//         // Disconnect handling
//         socket.on('disconnect', () => {
//             logger.info(`Disconnected | providerId: ${providerId}`);
//             if (providerId) socket.leave(providerId);
//         });
//     });
// }

// export { io };


