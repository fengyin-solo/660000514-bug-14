import SockJS from 'sockjs-client';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import type { User, InterviewRoom, ParticipantStatus } from '../types';

interface TrackedSubscription {
  destination: string;
  callback: (payload: any) => void;
  handle: StompSubscription | null;
}

let stompClient: Client | null = null;
let connectPromise: Promise<void> | null = null;
let trackedSubscriptions: TrackedSubscription[] = [];

const safeParse = (body: string): any => {
  const data = JSON.parse(body);
  // 后端统一用 WebSocketMessage<T> 包一层，前端兼容裸对象
  return data && typeof data === 'object' && 'payload' in data ? data.payload : data;
};

export function connect(roomId: string, user: User): Promise<void> {
  // 复用同一个连接，避免房间内多个组件各自创建 socket
  if (stompClient && connectPromise) {
    return connectPromise;
  }

  connectPromise = new Promise<void>((resolve, reject) => {
    const socket = new SockJS('http://localhost:8080/ws/interview');
    stompClient = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      connectHeaders: {
        roomId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
      },
    });

    let rejected = false;

    stompClient.onConnect = () => {
      // 首次连接或断线重连后，都（重新）注册全部订阅，保证状态持续同步
      for (const sub of trackedSubscriptions) {
        sub.handle = createBrokerSubscription(sub);
      }
      resolve();
    };

    stompClient.onStompError = (frame) => {
      const message = frame.headers['message'] || 'WebSocket connection error';
      if (!rejected) {
        rejected = true;
        reject(new Error(message));
      }
    };

    stompClient.activate();
  });

  // 连接失败后允许下次调用重新创建客户端
  connectPromise.catch(() => {
    stompClient = null;
    connectPromise = null;
  });

  return connectPromise;
}

export function disconnect(): void {
  if (stompClient) {
    stompClient.deactivate();
    stompClient = null;
  }
  connectPromise = null;
  trackedSubscriptions = [];
}

const createBrokerSubscription = (sub: TrackedSubscription): StompSubscription | null => {
  if (!stompClient || !stompClient.connected) {
    return null;
  }
  return stompClient.subscribe(sub.destination, (message: IMessage) => {
    try {
      sub.callback(safeParse(message.body));
    } catch (e) {
      console.error('Failed to parse message from ' + sub.destination + ':', e);
    }
  });
};

const addSubscription = (
  roomId: string,
  topic: string,
  callback: (payload: any) => void,
): () => void => {
  const tracked: TrackedSubscription = {
    destination: `/topic/room/${roomId}/${topic}`,
    callback,
    handle: null,
  };
  trackedSubscriptions.push(tracked);
  tracked.handle = createBrokerSubscription(tracked);

  return () => {
    try {
      tracked.handle?.unsubscribe();
    } catch {
      // 连接已断开时忽略
    }
    trackedSubscriptions = trackedSubscriptions.filter((s) => s !== tracked);
  };
};

export function subscribeParticipants(
  roomId: string,
  callback: (participants: ParticipantStatus[]) => void,
): () => void {
  return addSubscription(roomId, 'participants', callback);
}

export function subscribeRoomStatus(
  roomId: string,
  callback: (room: InterviewRoom) => void,
): () => void {
  return addSubscription(roomId, 'status', callback);
}

export function sendHeartbeat(roomId: string, user: User): void {
  if (!stompClient || !stompClient.connected) {
    return;
  }

  const headers = {
    roomId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
  };

  stompClient.publish({
    destination: `/app/heartbeat`,
    headers,
    body: JSON.stringify({
      type: 'HEARTBEAT',
      payload: headers,
    }),
  });
}
