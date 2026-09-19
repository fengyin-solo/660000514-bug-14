import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { JoinRoomPage } from './components/JoinRoomPage';
import { InterviewerRoomView } from './components/InterviewerRoomView';
import CandidateRoomView from './components/CandidateRoomView';
import { ProblemBankPage } from './components/ProblemBankPage';
import { useInterviewStore } from './store/interview';
import { InterviewRoom, User, getRoomStatusConfig } from './types';
import { CreateRoomModal } from './components/CreateRoomModal';
import { getRoomsByInterviewer } from './services/interviewRoomService';
import { isUsingMockData, setUseMockFallback } from './services/problemService';
import { ToastContainer } from './components/Toast';
import { useToastStore } from './store/toast';

const mockInterviewer: User = {
  id: 'interviewer-001',
  name: '张面试官',
  email: 'interviewer@example.com',
  role: 'INTERVIEWER',
  createdAt: new Date().toISOString(),
};

const InterviewerHomePage: React.FC = () => {
  const { currentUser, setCurrentUser, myRooms, setMyRooms, setCurrentRoom } = useInterviewStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(isUsingMockData());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setCurrentUser(mockInterviewer);
  }, [setCurrentUser]);

  const activeTab = location.pathname === '/problem-bank' ? 'bank' : 'interviews';

  const loadMyRooms = useCallback(async () => {
    if (!currentUser) return;
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const rooms = await getRoomsByInterviewer(currentUser.id);
      const fellBackToMock = isUsingMockData();
      if (fellBackToMock) {
        // 离线回退数据可能不完整或陈旧：与已有列表合并，已有房间不丢失，已前进的状态不倒退
        const existing = useInterviewStore.getState().myRooms;
        const incomingIds = new Set(rooms.map((r) => r.id));
        setMyRooms([...rooms, ...existing.filter((r) => !incomingIds.has(r.id))]);
      } else {
        setMyRooms(rooms);
      }
      setMockMode(fellBackToMock);
    } catch (error: any) {
      console.error('Failed to load rooms:', error);
      setRoomsError(error?.message || '未知错误');
    } finally {
      setRoomsLoading(false);
      setRoomsLoaded(true);
    }
  }, [currentUser, setMyRooms]);

  // 每次回到“我的面试”标签（从房间详情或题库管理返回）都重新加载，保证状态与详情一致
  useEffect(() => {
    if (currentUser && activeTab === 'interviews') {
      loadMyRooms();
    }
  }, [currentUser, activeTab, loadMyRooms]);

  const handleRetryLoad = () => {
    // 重新尝试连接后端；若仍不可用会自动回退到本地数据并展示提示
    setUseMockFallback(false);
    loadMyRooms();
  };

  const handleCreateRoomSuccess = (room: InterviewRoom) => {
    setCurrentRoom(room);
    navigate(`/room/${room.id}/interviewer`);
  };

  const handleEnterRoom = (room: InterviewRoom) => {
    setCurrentRoom(room);
    navigate(`/room/${room.id}/interviewer`);
  };

  const tabButtonStyle = (active: boolean) => ({
    padding: '12px 24px',
    background: 'transparent',
    border: 'none',
    color: active ? '#fff' : '#888',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: active ? 500 : 400,
    borderBottom: active ? '2px solid #667eea' : '2px solid transparent',
    transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', fontFamily: 'sans-serif' }}>
      <div style={{
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 'bold', fontSize: '16px',
          }}>
            {currentUser?.name?.charAt(0) || 'U'}
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 500 }}>{currentUser?.name}</div>
            <div style={{ color: '#888', fontSize: '12px' }}>{currentUser?.role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {activeTab === 'bank' ? null : (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                padding: '10px 24px',
                background: '#4caf50',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}>
              + 创建面试房间
            </button>
          )}
        </div>
      </div>

      <div style={{ background: '#1e1e1e', borderBottom: '1px solid #333' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '8px' }}>
          <Link
            to="/"
            style={{ textDecoration: 'none' }}
          >
            <button style={tabButtonStyle(activeTab === 'interviews')}>
              📋 我的面试
            </button>
          </Link>
          <Link
            to="/problem-bank"
            style={{ textDecoration: 'none' }}
          >
            <button style={tabButtonStyle(activeTab === 'bank')}>
              📝 题库管理
            </button>
          </Link>
        </div>
      </div>

      {activeTab === 'interviews' && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ color: '#fff', fontSize: '28px', margin: '0 0 8px 0' }}>我的面试</h1>
              <p style={{ color: '#888', margin: '0 0 32px 0' }}>管理您创建的所有面试房间</p>
            </div>
            {roomsLoading && roomsLoaded && (
              <span style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>刷新中…</span>
            )}
          </div>

          {mockMode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              background: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid rgba(255, 152, 0, 0.35)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}>
              <span style={{ color: '#ff9800', fontSize: '13px' }}>
                ⚠️ 无法连接服务器，当前展示本地缓存数据，房间状态可能不是最新。
              </span>
              <button
                onClick={handleRetryLoad}
                style={{
                  padding: '6px 16px',
                  background: 'transparent',
                  color: '#ff9800',
                  border: '1px solid #ff9800',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                }}>
                重试连接
              </button>
            </div>
          )}

          {roomsError && myRooms.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              background: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.35)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}>
              <span style={{ color: '#f44336', fontSize: '13px' }}>
                ❌ 列表刷新失败：{roomsError}（当前显示的是上次加载的数据）
              </span>
              <button
                onClick={handleRetryLoad}
                style={{
                  padding: '6px 16px',
                  background: 'transparent',
                  color: '#f44336',
                  border: '1px solid #f44336',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                }}>
                重试
              </button>
            </div>
          )}

          {!roomsLoaded || (roomsLoading && myRooms.length === 0 && !roomsError) ? (
            <div style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '64px 24px',
              textAlign: 'center',
              border: '1px dashed #333',
              color: '#888',
            }}>
              加载中…
            </div>
          ) : roomsError && myRooms.length === 0 ? (
            <div style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '64px 24px',
              textAlign: 'center',
              border: '1px dashed #333',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
              <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>面试房间加载失败</h3>
              <p style={{ color: '#f44336', margin: '0 0 24px 0', fontSize: '14px' }}>{roomsError}</p>
              <button
                onClick={handleRetryLoad}
                style={{
                  padding: '12px 32px',
                  background: '#2196f3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}>
                重试
              </button>
            </div>
          ) : myRooms.length === 0 ? (
            <div style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '64px 24px',
              textAlign: 'center',
              border: '1px dashed #333',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>暂无面试房间</h3>
              <p style={{ color: '#888', margin: '0 0 24px 0' }}>点击右上角按钮创建您的第一个面试房间</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  padding: '12px 32px',
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}>
                创建面试房间
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {myRooms.map((room) => {
                const statusConfig = getRoomStatusConfig(room.status);
                return (
                <div
                  key={room.id}
                  onClick={() => handleEnterRoom(room)}
                  style={{
                    background: '#1e1e1e',
                    borderRadius: '12px',
                    padding: '20px 24px',
                    border: '1px solid #333',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#4caf50';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#333';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ color: '#fff', margin: '0 0 4px 0', fontSize: '18px' }}>{room.title}</h3>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <span style={{ color: '#888', fontSize: '13px' }}>房间码: <span style={{ color: '#4caf50', fontFamily: 'monospace', fontWeight: 'bold' }}>{room.roomCode}</span></span>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 500,
                          background: statusConfig.bgColor,
                          color: statusConfig.color,
                          border: '1px solid ' + statusConfig.color + '40',
                        }}>
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                      </div>
                    </div>
                    <span style={{ color: '#4caf50', fontSize: '20px' }}>→</span>
                  </div>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    创建于 {new Date(room.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'bank' && (
        <ProblemBankPage />
      )}

      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateRoomSuccess}
      />
    </div>
  );
};

const InterviewerRoomPage: React.FC = () => {
  return <InterviewerRoomView />;
};

const App: React.FC = () => {
  const { toasts, removeToast } = useToastStore();
  return (
    <>
      <Routes>
        <Route path="/" element={<InterviewerHomePage />} />
        <Route path="/problem-bank" element={<InterviewerHomePage />} />
        <Route path="/join" element={<JoinRoomPage />} />
        <Route path="/room/:roomId/interviewer" element={<InterviewerRoomPage />} />
        <Route path="/room/:roomId/candidate" element={<CandidateRoomView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default App;
