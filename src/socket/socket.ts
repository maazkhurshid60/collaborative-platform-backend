import { Server } from 'socket.io';
import prisma from '../db/db.config';
import logger from '../utils/logger';

let io: Server;

export function setupSocket(server: any) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://collaborative-platform-frontend.vercel.app',
                "https://www.collaborateme.com/",
                "https://www.collaborateme.com",
                "https://app.kolabme.com"
            ],
        },
    });


    io.on('connection', async (socket: any) => {
        const providerId = socket.handshake.query.providerId;
        const userId = socket.handshake.query.userId;

        logger.info(`🔌 New connection: socketId=${socket.id}, userId=${userId}, providerId=${providerId}`);

        // Join UNIQUE notification room
        if (userId) {
            socket.join(`notification_room_${userId.toString()}`);
            logger.info(`👥 User joined notification room: ${userId}`);
        }

        // Provider personal room for legacy events
        if (providerId) {
            socket.join(providerId.toString());
            logger.info(`👥 Provider joined room: ${providerId}`);
        }


        // Direct message
        // socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
        //     try {
        //         // 🛠️ Ensure the sender is also joined to the room
        //         socket.join(message.chatChannelId); // ✅ This is key fix

        //         // // ✅ Broadcast message to everyone in the room (sender + receiver)
        //         // const decryptedMessage = {
        //         //     ...message,
        //         //     message: decryptText(message.message),
        //         // };
        //         io.to(message?.chatChannelId).emit('receive_direct', message.message);

        //         // 🔄 Unread refresh still sent to receiver only
        //         io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

        //     } catch (err) {
        //         console.error('Error sending direct message:', err);
        //     }
        // });

        socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }) => {
            try {
                // sender ko room me pakka join kara do
                socket.join(message.chatChannelId);

                // Plaintext object hi aayega (aap REST response me decrypt kar ke bhej chuke ho)
                const plainMessage = {
                    ...message, // id, senderId, chatChannelId, createdAt, sender, etc.
                    // message already plaintext from API response
                };

                io.to(message.chatChannelId).emit('receive_direct', {
                    ...message, // id, senderId, chatChannelId, createdAt, sender, etc.
                });

                // Unread refresh receiver ko
                io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });

            } catch (err: any) {
                logger.error(`Error sending direct message: ${err.message}`);
            }
        });

        // Join direct chat room
        socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            logger.debug(`Socket ${socket.id} joining ROOM: ${chatChannelId}`);
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

                logger.debug('Group message emitted');
            } catch (err: any) {
                logger.error(`Error in send_group: ${err.message}`);
            }
        });

        // Delete direct message
        socket.on('delete_direct_message', ({ chatChannelId, messageId }: { chatChannelId: string, messageId: string }) => {
            try {
                io.to(chatChannelId).emit('message_deleted', { messageId });
            } catch (err: any) {
                logger.error(`Error in delete_direct_message: ${err.message}`);
            }
        });

        // Delete chat channel (hide for current user)
        socket.on('delete_chat_channel', ({ chatChannelId, providerId }: { chatChannelId: string, providerId: string }) => {
            try {
                // Notify all sessions of the same provider
                io.to(providerId).emit('chat_channel_deleted', { chatChannelId });
            } catch (err: any) {
                logger.error(`Error in delete_chat_channel: ${err.message}`);
            }
        });


        // Disconnect handling
        socket.on('disconnect', () => {
            logger.info(`Disconnected | providerId: ${providerId}`);
            if (providerId) socket.leave(providerId);
        });
    });
}

export { io };


