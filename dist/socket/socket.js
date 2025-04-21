"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocket = setupSocket;
const socket_io_1 = require("socket.io");
const db_config_1 = __importDefault(require("../db/db.config"));
function setupSocket(server) {
    const io = new socket_io_1.Server(server, { cors: { origin: '*' } });
    console.log("⚡️ Socket.IO initialized");
    io.on('connection', (socket) => {
        const providerId = socket.handshake.query.providerId;
        console.log(`Provider ${providerId} connected`);
        // Join the provider's personal room
        socket.join(providerId);
        // Join all group chats the provider is a member of
        db_config_1.default.groupMembers.findMany({ where: { providerId } }).then(groups => {
            groups.forEach(group => socket.join(group.groupChatId));
        });
        // Handle sending a direct message
        socket.on('send_direct', (_a) => __awaiter(this, [_a], void 0, function* ({ toProviderId, content }) {
            try {
                const [a, b] = [providerId, toProviderId].sort();
                // Check if a chat channel exists between these two providers
                let channel = yield db_config_1.default.chatChannel.findFirst({
                    where: { providerAId: a, providerBId: b }
                });
                if (!channel) {
                    // If no channel exists, create a new one
                    channel = yield db_config_1.default.chatChannel.create({
                        data: { providerAId: a, providerBId: b }
                    });
                }
                socket.join(channel.id); // Join the newly created or existing channel room
                // Create the message in the database
                const message = yield db_config_1.default.chatMessage.create({
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
            }
            catch (err) {
                console.error('Error sending direct message:', err);
                socket.emit('error', { message: 'Error sending direct message' });
            }
        }));
        // Handle sending a group message
        socket.on('send_group', (_a) => __awaiter(this, [_a], void 0, function* ({ groupId, content }) {
            try {
                const message = yield db_config_1.default.chatMessage.create({
                    data: {
                        senderId: providerId,
                        message: content,
                        chatChannelId: groupId,
                        mediaUrl: '',
                        type: 'text'
                    }
                });
                io.to(groupId).emit('receive_group', message); // Send the message to all clients in the group
            }
            catch (err) {
                console.error('Error sending group message:', err);
                socket.emit('error', { message: 'Error sending group message' });
            }
        }));
        // Handle typing indicator
        socket.on('typing', (channelId) => {
            socket.to(channelId).emit('user_typing', { providerId });
        });
        socket.on('stop_typing', (channelId) => {
            socket.to(channelId).emit('user_stop_typing', { providerId });
        });
        // Handle message deletion
        socket.on('delete_message', (messageId) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield db_config_1.default.chatMessage.delete({
                    where: { id: messageId }
                });
                io.emit('message_deleted', { messageId });
            }
            catch (err) {
                console.error('Error deleting message:', err);
                socket.emit('error', { message: 'Error deleting message' });
            }
        }));
        // Handle user disconnection
        socket.on('disconnect', () => {
            console.log(`Provider ${providerId} disconnected`);
            // Optionally, you can leave the provider's personal rooms here if required:
            socket.leave(providerId);
        });
    });
}
