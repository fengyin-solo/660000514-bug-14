import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { JoinRoomPage } from './components/JoinRoomPage';
import { InterviewerRoomView } from './components/InterviewerRoomView';
import CandidateRoomView from './components/CandidateRoomView';
import { ProblemBankPage } from './components/ProblemBankPage';
import { useInterviewStore } from './store/interview';
import { InterviewRoom, User, getRoomStatusConfig } from './types';
import { CreateRoomModal } from './components/CreateRoomModal';
import { getRoomsByInterviewer } from './services/interviewRoomService';
import { isNetworkError } from './services/api';
import { ToastContainer } from './components/Toast';
import { useToastStore } from './store/toast';

const mockInterviewer: User = {
  id: 'interviewer-001',
  name: '张面试官',
  email: 'interviewer@example.com',
  role: 'INTERVIEWER',
  createdAt: new Date().toISOString(),
};

type RoomsLoadState = 'idle' | 'loading' | 'success' | 'error';

const InterviewerHomePage: React.FC = () => {
  const { currentUser, setCurrentUser, myRooms, setMyRooms, setCurrentRoom } = useInterviewStore();
  const { warning: showWarning } = useToastStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loadState, setLoadState] = useState<RoomsLoadState>('idle');
  const [loadError, setLoadError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const loadSeqRef = useRef(0);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    setCurrentUser(mockInterviewer);
  }, [setCurrentUser]);

  const loadMyRooms = useCallback(async () => {
    if (!currentUser) return;
    const seq = ++loadSeqRef.current;
    setLoadState('loading');
    setLoadError('');
    try {
      const rooms = await getRoomsByInterviewer(currentUser.id);
      // 只有最后一次请求可以落地，避免慢响应把更新后的数据覆盖回去
      if (seq === loadSeqRef.current) {
        setMyRooms(rooms);
        setLoadState('success');
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      const message = error instanceof Error ? error.message : '加载面试列表失败';
      setLoadError(message);
      setLoadState('error');
      console.error('Failed to load rooms:', error);
      if (isNetworkError(error)) {
        showWarning('网络连接失败，当前展示的可能是本地缓存数据，恢复后请点击重试');
      }
    }
  }, [currentUser, setMyRooms, showWarning]);

  useEffect(() => {
    if (currentUser) {
      initialLoadDoneRef.current = true;
      loadMyRooms();
    }
  }, [currentUser, loadMyRooms]);

  // 从「题库管理」切回「我的面试」时重新拉取，保证等待/进行/完成/取消状态最新且不倒退
  useEffect(() => {
    if (location.pathname === '/' && currentUser && initialLoadDoneRef.current && loadState !== 'loading') {
      loadMyRooms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleCreateRoomSuccess = (room: InterviewRoom) => {
    setCurrentRoom(room);
    navigate(`/room/${room.id}/interviewer`);
  };

  const handleEnterRoom = (room: InterviewRoom) => {
    setCurrentRoom(room);
    navigate(`/room/${room.id}/interviewer`);
  };

  const activeTab = location.pathname === '/problem-bank' ? 'bank' : 'interviews';

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h1 style={{ color: '#fff', fontSize: '28px', margin: 0 }}>我的面试</h1>
            <button
              onClick={loadMyRooms}
              disabled={loadState === 'loading'}
              title="重新加载"
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: '#888',
                border: '1px solid #333',
                borderRadius: '6px',
                cursor: loadState === 'loading' ? 'wait' : 'pointer',
                fontSize: '13px',
                opacity: loadState === 'loading' ? 0.6 : 1,
              }}>
              {loadState === 'loading' ? '刷新中...' : '↻ 刷新'}
            </button>
          </div>
          <p style={{ color: '#888', margin: '0 0 32px 0' }}>管理您创建的所有面试房间</p>

          {loadState === 'loading' && myRooms.length === 0 ? (
            <div style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '64px 24px',
              textAlign: 'center',
              border: '1px solid #333',
            }}>
              <div style={{ color: '#888', fontSize: '14px' }}>正在加载面试列表...</div>
            </div>
          ) : loadState === 'error' && myRooms.length === 0 ? (
            <div style={{
              background: '#1e1e1e',
              borderRadius: '12px',
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px solid rgba(244, 67, 54, 0.4)',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>加载失败</h3>
              <p style={{ color: '#f44336', fontSize: '13px', margin: '0 0 24px 0', wordBreak: 'break-word' }}>
                {loadError || '无法获取面试列表，请检查网络后重试'}
              </p>
              <button
                onClick={loadMyRooms}
                style={{
                  padding: '10px 28px',
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
          ) : loadState === 'success' && myRooms.length === 0 ? (
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
            <>
              {loadState === 'error' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  background: 'rgba(244, 67, 54, 0.1)',
                  border: '1px solid rgba(244, 67, 54, 0.4)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  marginBottom: '16px',
                }}>
                  <span style={{ color: '#f44336', fontSize: '13px' }}>
                    ⚠️ 刷新失败：{loadError}。以下为上次加载的数据，可能不是最新状态。
                  </span>
                  <button
                    onClick={loadMyRooms}
                    style={{
                      flexShrink: 0,
                      padding: '6px 16px',
                      background: '#f44336',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}>
                    重试
                  </button>
                </div>
              )}
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
            </>
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
