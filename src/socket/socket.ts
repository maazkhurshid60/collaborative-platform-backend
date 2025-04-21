
import { Server } from 'socket.io';
import prisma from '../db/db.config';

export function setupSocket(server: any) {
    const io = new Server(server, { cors: { origin: '*' } });
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
        socket.on('send_direct', async ({ toProviderId, content }: { toProviderId: string, content: string }) => {
            try {
                const [a, b] = [providerId, toProviderId].sort();

                // Check if a chat channel exists between these two providers
                let channel = await prisma.chatChannel.findFirst({
                    where: { providerAId: a, providerBId: b }
                });

                if (!channel) {
                    // If no channel exists, create a new one
                    channel = await prisma.chatChannel.create({
                        data: { providerAId: a, providerBId: b }
                    });
                }

                socket.join(channel.id); // Join the newly created or existing channel room

                // Create the message in the database
                const message = await prisma.chatMessage.create({
                    data: {
                        senderId: providerId,
                        message: content,
                        chatChannelId: channel.id,
                        mediaUrl: '',
                        type: 'text'
                    }
                });

                // Emit the message to the channel
                io.to(channel.id).emit('receive_direct', message);
            } catch (err) {
                console.error('Error sending direct message:', err);
                socket.emit('error', { message: 'Error sending direct message' });
            }
        });

        // Handle sending a group message
        socket.on('send_group', async ({ groupId, content }: { groupId: any, content: any }) => {
            try {
                const message = await prisma.chatMessage.create({
                    data: {
                        senderId: providerId,
                        message: content,
                        chatChannelId: groupId,
                        mediaUrl: '',
                        type: 'text'
                    }
                });

                io.to(groupId).emit('receive_group', message);  // Send the message to all clients in the group
            } catch (err) {
                console.error('Error sending group message:', err);
                socket.emit('error', { message: 'Error sending group message' });
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

                io.emit('message_deleted', { messageId });
            } catch (err) {
                console.error('Error deleting message:', err);
                socket.emit('error', { message: 'Error deleting message' });
            }
        });

        // Handle user disconnection
        socket.on('disconnect', () => {
            console.log(`Provider ${providerId} disconnected`);

            // Optionally, you can leave the provider's personal rooms here if required:
            socket.leave(providerId);
        });
    });
}
