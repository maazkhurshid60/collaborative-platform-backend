


import { Server } from 'socket.io';
import prisma from '../db/db.config';
let io: Server;
export function setupSocket(server: any) {
    const io = new Server(server, { cors: { origin: ['http://localhost:5173', 'http://localhost:4173', "https://collaborative-platform-frontend.vercel.app"] } });
    console.log("⚡️ Socket.IO initialized");

    io.on('connection', (socket: any) => {
        const providerId = socket.handshake.query.providerId;
        console.log(`Provider ${providerId} connected`);

        // Join the provider's personal room
        socket.join(providerId);

        // Join all group chats the provider is a member of
        prisma.groupMembers.findMany({ where: { providerId } }).then(groups => {
            groups.forEach(group => socket.join(group.groupChatId));
        });

        // Handle sending a direct message

        socket.on('send_direct', ({ toProviderId, message }: { toProviderId: string, message: any }

        ) => {
            try {
                // ✅ Just emit the already saved message — don't save again
                io.to(message.chatChannelId).emit('receive_direct', message);
            } catch (err) {
                console.error('Error sending direct message:', err);
            }
        });


        // Allow clients to join a direct-chat room by channel ID
        socket.on('join_channel', ({ chatChannelId }: { chatChannelId: string }) => {
            console.log(`✅ [BACKEND] Socket ${socket.id} joining ROOM: ${chatChannelId}`);
            socket.join(chatChannelId);
        });

        // Handle sending a group message

        socket.on('send_group', ({ message }: { message: any }) => {
            try {
                // ✅ Don't create message again — emit only
                io.to(message.groupId).emit('receive_group', message);
                console.log('✅ Group message emitted:', message);
            } catch (err) {
                console.error('❌ Error in send_group:', err);
            }
        });


        // Handle typing indicator
        socket.on('typing', (channelId: string) => {
            socket.to(channelId).emit('user_typing', { providerId });
        });

        socket.on('stop_typing', (channelId: string) => {
            socket.to(channelId).emit('user_stop_typing', { providerId });
        });

        // Handle message deletion
        socket.on('delete_message', async (messageId: string) => {
            try {
                await prisma.chatMessage.delete({
                    where: { id: messageId }
                });

                io.emit('message_deleted', { messageId });  // Notify all users about the deletion

            } catch (err) {
                console.error('Error deleting message:', err);
                socket.emit('error', { message: 'Error deleting message' });
            }
        });

        // Handle user disconnection
        socket.on('disconnect', () => {
            console.log(`Provider ${providerId} disconnected`);
            socket.leave(providerId);
        });
    });

}


export { io }; 