import { create } from 'zustand';
import { Problem, Submission, InterviewRoom, User, CandidateInvitation, ParticipantStatus, getDefaultCodeByLanguage, isRoomStatusRegression } from '../types';

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
  setRoom: (room: InterviewRoom) => void;
  setCurrentUser: (user: User) => void;
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
  setRoom: (room) => set({ deprecatedRoom: room, room, currentRoom: room }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setMyRooms: (rooms) => set((state) => ({
    // 与详情共用同一状态口径：已前进的状态（等待→进行→完成/取消）不允许被旧数据覆盖倒退
    myRooms: rooms.map((room) => {
      const existing = state.myRooms.find((r) => r.id === room.id);
      if (existing && isRoomStatusRegression(existing.status, room.status)) {
        return {
          ...room,
          status: existing.status,
          startedAt: existing.startedAt ?? room.startedAt,
          endedAt: existing.endedAt ?? room.endedAt,
        };
      }
      return room;
    }),
  })),
  setCurrentRoom: (room) => set((state) => {
    const oldRoom = state.currentRoom;
    if (oldRoom && room && oldRoom.id === room.id && isRoomStatusRegression(oldRoom.status, room.status)) {
      // 忽略会倒退的陈旧状态（如离线缓存、竞态响应），保留当前状态与时间戳
      const merged = {
        ...room,
        status: oldRoom.status,
        startedAt: oldRoom.startedAt ?? room.startedAt,
        endedAt: oldRoom.endedAt ?? room.endedAt,
      };
      return { currentRoom: merged, deprecatedRoom: merged, room: merged };
    }
    if (oldRoom && room && oldRoom.status !== room.status) {
      const notification: StatusChangeNotification = {
        id: `status-change-${Date.now()}`,
        oldStatus: oldRoom.status,
        newStatus: room.status,
        timestamp: new Date().toISOString(),
      };
      return {
        currentRoom: room,
        deprecatedRoom: room,
        room,
        statusChangeNotification: notification,
      };
    }
    return { currentRoom: room, deprecatedRoom: room, room };
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
