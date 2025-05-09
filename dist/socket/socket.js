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
exports.io = void 0;
exports.setupSocket = setupSocket;
const socket_io_1 = require("socket.io");
const db_config_1 = __importDefault(require("../db/db.config"));
let io;
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
                const providerA = yield db_config_1.default.provider.findUnique({ where: { id: a } });
                const providerB = yield db_config_1.default.provider.findUnique({ where: { id: b } });
                if (!providerA || !providerB) {
                    console.error("One of the providers doesn't exist in DB:", { a, b });
                    socket.emit('error', { message: 'Invalid provider(s)' });
                    return;
                }
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
                // socket.join(channel.id); // Join the newly created or existing channel room
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
                console.log("============================LINE 165 CHECK.============================", message);
                // Emit the message to the channel
                io.to(channel.id).emit('receive_direct', message); // Emit the message to the channel
                console.log("============================LINE 70 CHECK.============================", message);
                // Emit directly to the other provider’s personal room
                // io.to(toProviderId).emit('receive_direct', message);
                // console.log("============================LINE 174 CHECK.============================", message);
            }
            catch (err) {
                console.error('============================Error sending direct message:============================', err);
                socket.emit('error', { message: 'Error sending direct message' });
            }
        }));
        // Allow clients to join a direct-chat room by channel ID
        socket.on('join_channel', ({ chatChannelId }) => {
            console.log(`✅ [BACKEND] Socket ${socket.id} joining ROOM: ${chatChannelId}`);
            socket.join(chatChannelId);
        });
        // Handle sending a group message
        socket.on('send_group', (_a) => __awaiter(this, [_a], void 0, function* ({ groupId, content }) {
            try {
                // Make sure the group exists
                const group = yield db_config_1.default.groupChat.findUnique({
                    where: { id: groupId },
                });
                if (!group) {
                    throw new Error("Invalid group ID: group does not exist");
                }
                // Save the group message with groupId (not chatChannelId!)
                const message = yield db_config_1.default.chatMessage.create({
                    data: {
                        senderId: providerId,
                        message: content,
                        groupId: groupId, // ✅ This is correct
                        mediaUrl: '',
                        type: 'text',
                    }
                });
                // Emit to group room using groupId as room name
                io.to(groupId).emit('receive_group', message); // ✅ match frontend join
                console.log("✅ Group message sent", message);
            }
            catch (err) {
                console.error('❌ Error sending group message:', err);
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
                io.emit('message_deleted', { messageId }); // Notify all users about the deletion
            }
            catch (err) {
                console.error('Error deleting message:', err);
                socket.emit('error', { message: 'Error deleting message' });
            }
        }));
        // Handle user disconnection
        socket.on('disconnect', () => {
            console.log(`Provider ${providerId} disconnected`);
            socket.leave(providerId);
        });
    });
}
