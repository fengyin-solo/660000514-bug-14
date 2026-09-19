import { create } from 'zustand';
import { Problem, Submission, InterviewRoom, User, CandidateInvitation, ParticipantStatus, RoomStatus, isRoomStatus, canTransitionRoomStatus, getDefaultCodeByLanguage } from '../types';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  runtime?: number;
  memory?: number;
  testResults?: { passed: boolean; input: string; expected: string; actual?: string }[];
}

export interface ExecutionHistoryItem {
  id: string;
  type: 'run' | 'submit';
  result: ExecutionResult;
  timestamp: string;
  language: string;
  passedCount: number;
  totalCount: number;
  runtime?: number;
  memory?: number;
  status: 'pending' | 'running' | 'success' | 'failed';
}

export interface StatusChangeNotification {
  id: string;
  oldStatus: InterviewRoom['status'];
  newStatus: InterviewRoom['status'];
  timestamp: string;
}

interface InterviewState {
  problems: Problem[];
  currentProblem: Problem | null;
  submissions: Submission[];
  deprecatedRoom: InterviewRoom | null;
  room: InterviewRoom | null;
  code: string;
  originalCode: string;
  language: string;
  isRunning: boolean;
  isSubmitting: boolean;
  lastRunResult: ExecutionResult | null;
  lastSubmissionResult: ExecutionResult | null;
  executionHistory: ExecutionHistoryItem[];
  currentUser: User | null;
  myRooms: InterviewRoom[];
  currentRoom: InterviewRoom | null;
  invitations: CandidateInvitation[];
  participants: ParticipantStatus[];
  isConnected: boolean;
  statusChangeNotification: StatusChangeNotification | null;
  setProblem: (p: Problem) => void;
  setCode: (code: string) => void;
  setLanguage: (lang: string) => void;
  setIsRunning: (running: boolean) => void;
  setIsSubmitting: (submitting: boolean) => void;
  setLastRunResult: (result: ExecutionResult | null) => void;
  setLastSubmissionResult: (result: ExecutionResult | null) => void;
  addExecutionHistory: (item: ExecutionHistoryItem) => void;
  clearExecutionHistory: () => void;
  resetOriginalCode: () => void;
  addSubmission: (s: Submission) => void;
  /** 以"状态只进不退"的方式合并单个房间（同时更新 currentRoom 与 myRooms） */
  upsertRoom: (room: InterviewRoom) => void;
  setRoom: (room: InterviewRoom) => void;
  setCurrentUser: (user: User) => void;
  /** 合并房间列表：保留本地已知的更新状态，避免旧快照把状态拉回去 */
  setMyRooms: (rooms: InterviewRoom[]) => void;
  setCurrentRoom: (room: InterviewRoom | null) => void;
  setInvitations: (invitations: CandidateInvitation[]) => void;
  setParticipants: (participants: ParticipantStatus[]) => void;
  addInvitation: (invitation: CandidateInvitation) => void;
  updateInvitationStatus: (invitationId: string, status: string) => void;
  updateParticipant: (participant: ParticipantStatus) => void;
  setIsConnected: (connected: boolean) => void;
  setStatusChangeNotification: (notification: StatusChangeNotification | null) => void;
  resetRoom: () => void;
  setProblems: (problems: Problem[]) => void;
  addProblem: (problem: Problem) => void;
  updateProblem: (problem: Problem) => void;
  removeProblem: (problemId: string) => void;
  updateExecutionHistory: (id: string, updates: Partial<ExecutionHistoryItem>) => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  problems: [], currentProblem: null, submissions: [], deprecatedRoom: null, room: null,
  code: getDefaultCodeByLanguage('javascript'), originalCode: getDefaultCodeByLanguage('javascript'), language: 'javascript',
  isRunning: false, isSubmitting: false, lastRunResult: null, lastSubmissionResult: null,
  executionHistory: [],
  currentUser: null, myRooms: [], currentRoom: null, invitations: [], participants: [], isConnected: false,
  statusChangeNotification: null,
  setProblem: (p) => set({ currentProblem: p }),
  setCode: (code) => set({ code }),
  setLanguage: (lang) => {
    const defaultCode = getDefaultCodeByLanguage(lang);
    set({
      language: lang,
      code: defaultCode,
      originalCode: defaultCode,
      lastRunResult: null,
      lastSubmissionResult: null,
      executionHistory: [],
    });
  },
  setIsRunning: (running) => set({ isRunning: running }),
  setIsSubmitting: (submitting) => set({ isSubmitting: submitting }),
  setLastRunResult: (result) => set({ lastRunResult: result }),
  setLastSubmissionResult: (result) => set({ lastSubmissionResult: result }),
  addExecutionHistory: (item) => set((state) => ({
    executionHistory: [item, ...state.executionHistory].slice(0, 20),
  })),
  clearExecutionHistory: () => set({ executionHistory: [] }),
  resetOriginalCode: () => set({ originalCode: useInterviewStore.getState().code }),
  addSubmission: (s) => set({ submissions: [s, ...useInterviewStore.getState().submissions] }),
  upsertRoom: (room) => set((state) => {
    const safeRoom = { ...room, status: normalizeRoomStatus(room.status) };
    const listRoom = mergeRoom(state.myRooms.find((r) => r.id === safeRoom.id), safeRoom);
    const myRooms = upsertIntoList(state.myRooms, listRoom);
    if (state.currentRoom && state.currentRoom.id === safeRoom.id) {
      const currentMerged = mergeRoom(state.currentRoom, safeRoom);
      // 列表中同一房间使用与 currentRoom 完全一致的合并结果
      const myRoomsSynced = upsertIntoList(
        myRooms.filter((r) => r.id !== currentMerged.id),
        currentMerged,
      );
      return {
        myRooms: myRoomsSynced,
        room: currentMerged,
        deprecatedRoom: currentMerged,
        currentRoom: currentMerged,
        statusChangeNotification: buildStatusNotification(state.currentRoom, currentMerged, state.statusChangeNotification),
      };
    }
    return { myRooms };
  }),
  setRoom: (room) => set((state) => {
    const merged = mergeRoom(state.room, room);
    return {
      deprecatedRoom: merged,
      room: merged,
      currentRoom: merged,
      myRooms: upsertIntoList(state.myRooms, merged),
      statusChangeNotification: buildStatusNotification(state.currentRoom, merged, state.statusChangeNotification),
    };
  }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setMyRooms: (rooms) => set((state) => ({ myRooms: mergeRoomList(state.myRooms, rooms) })),
  setCurrentRoom: (room) => set((state) => {
    if (!room) {
      return { currentRoom: null, deprecatedRoom: null, room: null };
    }
    const merged = mergeRoom(state.currentRoom, room);
    return {
      currentRoom: merged,
      deprecatedRoom: merged,
      room: merged,
      myRooms: upsertIntoList(state.myRooms, merged),
      statusChangeNotification: buildStatusNotification(state.currentRoom, merged, state.statusChangeNotification),
    };
  }),
  setInvitations: (invitations) => set({ invitations }),
  setParticipants: (participants) => set({ participants }),
  addInvitation: (invitation) => set((state) => ({ invitations: [...state.invitations, invitation] })),
  updateInvitationStatus: (invitationId, status) => set((state) => ({
    invitations: state.invitations.map((inv) =>
      inv.id === invitationId ? { ...inv, status: status as CandidateInvitation['status'] } : inv
    ),
  })),
  updateParticipant: (participant) => set((state) => {
    const exists = state.participants.some((p) => p.userId === participant.userId);
    if (exists) {
      return {
        participants: state.participants.map((p) =>
          p.userId === participant.userId ? participant : p
        ),
      };
    }
    return { participants: [...state.participants, participant] };
  }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setStatusChangeNotification: (notification) => set({ statusChangeNotification: notification }),
  resetRoom: () => set({
    currentRoom: null, deprecatedRoom: null, room: null,
    currentProblem: null,
    invitations: [], participants: [], isConnected: false,
    executionHistory: [],
    lastRunResult: null,
    lastSubmissionResult: null,
    statusChangeNotification: null,
  }),
  setProblems: (problems) => set({ problems }),
  addProblem: (problem) => set((state) => ({ problems: [problem, ...state.problems] })),
  updateProblem: (problem) => set((state) => ({
    problems: state.problems.map((p) => p.id === problem.id ? problem : p),
  })),
  removeProblem: (problemId) => set((state) => ({
    problems: state.problems.filter((p) => p.id !== problemId),
  })),
  updateExecutionHistory: (id, updates) => set((state) => ({
    executionHistory: state.executionHistory.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    ),
  })),
}));

// ---------------------------------------------------------------------------
// 房间状态在本地只能沿状态机前进，不能后退。
// 所有来源的房间数据（HTTP 响应、定时轮询、WebSocket 推送）都必须先经过
// mergeRoom / mergeRoomList 归一化，避免乱序或失败重试拿到的旧快照覆盖新状态。
// ---------------------------------------------------------------------------

const normalizeRoomStatus = (status: unknown): RoomStatus =>
  isRoomStatus(status) ? status : 'WAITING';

/**
 * 用 incoming 合并 current：
 * - 状态按 WAITING -> ACTIVE -> COMPLETED/CANCELLED 单调推进；
 * - 非法的回退（含 COMPLETED 与 CANCELLED 互换）会被拒绝，保留本地更新的状态；
 * - 其余字段以 incoming 为准，缺失的 startedAt/endedAt 用本地数据补齐。
 */
const mergeRoom = (
  current: InterviewRoom | null | undefined,
  incoming: InterviewRoom,
): InterviewRoom => {
  const safeIncoming = { ...incoming, status: normalizeRoomStatus(incoming.status) };
  if (!current || current.id !== incoming.id) {
    return safeIncoming;
  }

  const currentStatus = normalizeRoomStatus(current.status);
  const incomingStatus = safeIncoming.status;

  if (!canTransitionRoomStatus(currentStatus, incomingStatus)) {
    // 旧快照 / 乱序消息：状态及其时间戳保持本地值，只刷新标题等普通字段
    return {
      ...safeIncoming,
      status: currentStatus,
      startedAt: current.startedAt ?? safeIncoming.startedAt,
      endedAt: current.endedAt ?? safeIncoming.endedAt,
    };
  }

  const merged: InterviewRoom = { ...current, ...safeIncoming, status: incomingStatus };
  if (incomingStatus === 'ACTIVE' && !merged.startedAt) {
    merged.startedAt = current.startedAt ?? current.createdAt;
  }
  if ((incomingStatus === 'COMPLETED' || incomingStatus === 'CANCELLED') && !merged.endedAt) {
    merged.endedAt = current.endedAt;
  }
  // 进入终态后 startedAt 不应丢失
  if ((incomingStatus === 'COMPLETED' || incomingStatus === 'CANCELLED') && !merged.startedAt) {
    merged.startedAt = current.startedAt;
  }
  return merged;
};

const upsertIntoList = (list: InterviewRoom[], room: InterviewRoom): InterviewRoom[] => {
  const index = list.findIndex((r) => r.id === room.id);
  if (index === -1) {
    return [room, ...list];
  }
  const copy = [...list];
  copy[index] = mergeRoom(list[index], room);
  return copy;
};

/**
 * 合并服务端返回的列表：顺序与集合以服务端为准，每个房间单独做单调合并，
 * 本地刚创建/更新但尚未出现在响应中的房间保留在末尾。
 */
const mergeRoomList = (currentList: InterviewRoom[], incomingList: InterviewRoom[]): InterviewRoom[] => {
  const incomingIds = new Set(incomingList.map((r) => r.id));
  const merged = incomingList.map((incoming) =>
    mergeRoom(currentList.find((r) => r.id === incoming.id), incoming),
  );
  for (const local of currentList) {
    if (!incomingIds.has(local.id)) {
      merged.push(local);
    }
  }
  return merged;
};

const buildStatusNotification = (
  oldRoom: InterviewRoom | null,
  newRoom: InterviewRoom,
  previous: StatusChangeNotification | null,
): StatusChangeNotification | null => {
  if (!oldRoom || oldRoom.id !== newRoom.id || oldRoom.status === newRoom.status) {
    return previous;
  }
  return {
    id: `status-change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    oldStatus: oldRoom.status,
    newStatus: newRoom.status,
    timestamp: new Date().toISOString(),
  };
};
