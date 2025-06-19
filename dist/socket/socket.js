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
    exports.io = io = new socket_io_1.Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://collaborative-platform-frontend.vercel.app'
            ],
        },
    });
    console.log("⚡️ Socket.IO initialized");
    io.on('connection', (socket) => __awaiter(this, void 0, void 0, function* () {
        const providerId = socket.handshake.query.providerId;
        const userId = socket.handshake.query.userId;
        console.log(`Socket connected | userId: ${userId || '-'} | providerId: ${providerId || '-'}`);
        // Join notification room
        if (userId) {
            socket.join(userId);
        }
        // Join provider personal room and their group chats
        if (providerId) {
            socket.join(providerId);
            try {
                const groups = yield db_config_1.default.groupMembers.findMany({
                    where: { providerId: providerId.toString() },
                });
                groups.forEach(group => socket.join(group.groupChatId));
            }
            catch (err) {
                console.error('Error joining group chats:', err);
            }
        }
        // Direct message
        socket.on('send_direct', ({ toProviderId, message }) => {
            try {
                io.to(message === null || message === void 0 ? void 0 : message.chatChannelId).emit('receive_direct', message);
                io.to(toProviderId).emit('receive_direct', message); // this ensures the other user gets it
                io.to(toProviderId).emit('refresh_unread', { chatChannelId: message.chatChannelId });
            }
            catch (err) {
                console.error('Error sending direct message:', err);
            }
        });
        // Join direct chat room
        socket.on('join_channel', ({ chatChannelId }) => {
            console.log(`Socket ${socket.id} joining ROOM: ${chatChannelId}`);
            socket.join(chatChannelId);
        });
        // Group message
        socket.on('send_group', ({ message }) => {
            try {
                io.to(message.groupId).emit('receive_group', message);
                console.log('Group message emitted:', message);
            }
            catch (err) {
                console.error('Error in send_group:', err);
            }
        });
        // Disconnect handling
        socket.on('disconnect', () => {
            console.log(`Disconnected | userId: ${userId || '-'} | providerId: ${providerId || '-'}`);
            if (providerId)
                socket.leave(providerId);
            if (userId)
                socket.leave(userId);
        });
    }));
}
