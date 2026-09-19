import { request } from './api';
import type { CreateRoomRequest, InterviewRoom, ParticipantStatus, JoinRoomResponse, CreateRoomResponse } from '../types';
import {
  mockCreateRoom,
  mockGetRoomById,
  mockGetRoomByCode,
  mockGetRoomsByInterviewer,
  mockUpdateRoomStatus,
  mockGetRoomParticipants,
  mockJoinRoom,
  mockLeaveRoom,
  mockHeartbeat,
} from './mockInterviewRoomService';
import { isUsingMockData } from './problemService';

export async function createRoom(data: CreateRoomRequest): Promise<CreateRoomResponse> {
  if (isUsingMockData()) {
    return mockCreateRoom(data);
  }
  return request<CreateRoomResponse>('/interview-rooms', {
    method: 'POST',
    body: data,
  });
}

export async function getRoomById(roomId: string): Promise<InterviewRoom> {
  if (isUsingMockData()) {
    return mockGetRoomById(roomId);
  }
  return request<InterviewRoom>(`/interview-rooms/${roomId}`);
}

export async function getRoomByCode(roomCode: string): Promise<InterviewRoom> {
  if (isUsingMockData()) {
    return mockGetRoomByCode(roomCode);
  }
  return request<InterviewRoom>(`/interview-rooms/code/${roomCode}`);
}

export async function getRoomsByInterviewer(interviewerId: string): Promise<InterviewRoom[]> {
  if (isUsingMockData()) {
    return mockGetRoomsByInterviewer(interviewerId);
  }
  return request<InterviewRoom[]>(`/interview-rooms/interviewer/${interviewerId}`);
}

export async function updateRoomStatus(roomId: string, status: string): Promise<InterviewRoom> {
  if (isUsingMockData()) {
    return mockUpdateRoomStatus(roomId, status);
  }
  return request<InterviewRoom>(`/interview-rooms/${roomId}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export async function getRoomParticipants(roomId: string): Promise<ParticipantStatus[]> {
  if (isUsingMockData()) {
    return mockGetRoomParticipants(roomId);
  }
  return request<ParticipantStatus[]>(`/interview-rooms/${roomId}/participants`);
}

export async function joinRoom(roomId: string, data: { candidateName: string; inviteToken: string }): Promise<JoinRoomResponse> {
  if (isUsingMockData()) {
    return mockJoinRoom(roomId, data);
  }
  return request<JoinRoomResponse>(`/interview-rooms/${roomId}/join`, {
    method: 'POST',
    body: data,
  });
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  if (isUsingMockData()) {
    return mockLeaveRoom(roomId, userId);
  }
  return request<void>(`/interview-rooms/${roomId}/leave`, {
    method: 'POST',
    body: { userId },
  });
}

export async function heartbeat(roomId: string, userId: string): Promise<ParticipantStatus> {
  if (isUsingMockData()) {
    return mockHeartbeat(roomId, userId);
  }
  return request<ParticipantStatus>(`/interview-rooms/${roomId}/heartbeat`, {
    method: 'POST',
    body: { userId },
  });
}
