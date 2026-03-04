import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class NotificationsGateway
    implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedUsers = new Map<string, string>(); // userId -> socketId

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        // Remove user from connected users
        for (const [userId, socketId] of this.connectedUsers.entries()) {
            if (socketId === client.id) {
                this.connectedUsers.delete(userId);
                this.broadcastUserStatus(userId, 'offline');
                break;
            }
        }
    }

    registerUser(userId: string, socketId: string) {
        this.connectedUsers.set(userId, socketId);
        this.broadcastUserStatus(userId, 'online');
    }

    sendNotification(userId: string, notification: any) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.server.to(socketId).emit('notification', notification);
        }
    }

    broadcastUserStatus(userId: string, status: 'online' | 'offline') {
        this.server.emit('userStatus', { userId, status });
    }

    broadcastTaskUpdate(taskId: string, task: any) {
        this.server.emit('taskUpdate', { taskId, task });
    }
}
