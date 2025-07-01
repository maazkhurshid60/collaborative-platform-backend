

import { Server } from 'socket.io';
import prisma from '../db/db.config';

let io: Server;

export function setupSocket(server: any) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://collaborative-platform-frontend.vercel.app',
                "https://www.collaborateme.com/",
                "https://www.collaborateme.com",
            ],
        },
    });

    console.log("⚡️ Socket.IO initialized");

    io.on('connection', async (socket: any) => {
        const providerId = socket.handshake.query.providerId;
        // const userId = socket.handshake.query.userId;

        console.log(`Socket connected  providerId: ${providerId || '-'}`);

        // Join notification room
        // if (userId) {
        //     socket.join(userId);
        // }

        // Join provider personal room and their group chats
        if (providerId) {
            socket.join(providerId);

            try {
                const groups = await prisma.groupMembers.findMany({
                    where: { providerId: providerId.toString() },
                });
                groups.forEach(group => socket.join(group.groupChatId));
            } catch (err) {
                console.error('Error joining group chats:', err);
            }
        }

        // Direct message
        // socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
        //     try {

        //         io.to(message?.chatChannelId).emit('receive_direct', message);
        //         io.to(toProviderId).emit('receive_direct', message); // this ensures the other user gets it
        //         io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });


        //     } catch (err) {
        //         console.error('Error sending direct message:', err);
        //     }
        // });
        // Direct message
        socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
            try {
                // 🛠️ Ensure the sender is also joined to the room
                socket.join(message.chatChannelId); // ✅ This is key fix

                // ✅ Broadcast message to everyone in the room (sender + receiver)
                io.to(message?.chatChannelId).emit('receive_direct', message);

                // 🔄 Unread refresh still sent to receiver only
                io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

            } catch (err) {
                console.error('Error sending direct message:', err);
            }
        });
        // Join direct chat room
        socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            console.log(`Socket ${socket.id} joining ROOM: ${chatChannelId}`);
            socket.join(chatChannelId);
        });

        // Group message
        // socket.on('send_group', ({ message }: { message: any }) => {
        //     try {
        //         io.to(message.groupId).emit('receive_group', message);
        //         console.log('Group message emitted:', message);
        //     } catch (err) {
        //         console.error('Error in send_group:', err);
        //     }
        // });
        socket.on('send_group', ({ message }: { message: any }) => {
            try {
                // ✅ Ensure the sender is joined to the group room
                socket.join(message.groupId); // 🔑 Important for sender to also receive the message

                // ✅ Emit message to everyone in the group
                io.to(message.groupId).emit('receive_group', message);

                console.log('Group message emitted:', message);
            } catch (err) {
                console.error('Error in send_group:', err);
            }
        });


        // Disconnect handling
        socket.on('disconnect', () => {
            console.log(`Disconnected | providerId: ${providerId || '-'}`);
            if (providerId) socket.leave(providerId);
            // if (userId) socket.leave(userId);
        });
    });
}

export { io };
