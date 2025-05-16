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
    const io = new socket_io_1.Server(server, { cors: { origin: ['http://localhost:5173', 'http://localhost:4173', "https://collaborative-platform-frontend.vercel.app"] } });
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
        socket.on('send_direct', ({ toProviderId, message }) => {
            try {
                // ✅ Just emit the already saved message — don't save again
                io.to(message.chatChannelId).emit('receive_direct', message);
            }
            catch (err) {
                console.error('Error sending direct message:', err);
            }
        });
        // Allow clients to join a direct-chat room by channel ID
        socket.on('join_channel', ({ chatChannelId }) => {
            console.log(`✅ [BACKEND] Socket ${socket.id} joining ROOM: ${chatChannelId}`);
            socket.join(chatChannelId);
        });
        // Handle sending a group message
        socket.on('send_group', ({ message }) => {
            try {
                // ✅ Don't create message again — emit only
                io.to(message.groupId).emit('receive_group', message);
                console.log('✅ Group message emitted:', message);
            }
            catch (err) {
                console.error('❌ Error in send_group:', err);
            }
        });
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
