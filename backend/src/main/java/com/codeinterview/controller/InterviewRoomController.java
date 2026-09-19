package com.codeinterview.controller;

import com.codeinterview.dto.CreateRoomResponse;
import com.codeinterview.dto.JoinRoomResponse;
import com.codeinterview.dto.WebSocketMessage;
import com.codeinterview.model.CandidateInvitation;
import com.codeinterview.model.InterviewRoom;
import com.codeinterview.model.ParticipantStatus;
import com.codeinterview.repository.CandidateInvitationRepository;
import com.codeinterview.repository.InterviewRoomRepository;
import com.codeinterview.repository.ParticipantStatusRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.HashMap;

@RestController
@RequestMapping("/api/interview-rooms")
@CrossOrigin(origins = "*")
public class InterviewRoomController {

    @Autowired
    private InterviewRoomRepository interviewRoomRepository;

    @Autowired
    private CandidateInvitationRepository candidateInvitationRepository;

    @Autowired
    private ParticipantStatusRepository participantStatusRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private static final String ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int ROOM_CODE_LENGTH = 6;

    /** 房间状态机：等待 -> 进行 -> 完成/取消，完成与取消为终态，任何状态都不可倒退 */
    private static final Map<String, Set<String>> ALLOWED_STATUS_TRANSITIONS = new HashMap<>();
    static {
        ALLOWED_STATUS_TRANSITIONS.put("WAITING", Set.of("ACTIVE", "CANCELLED"));
        ALLOWED_STATUS_TRANSITIONS.put("ACTIVE", Set.of("COMPLETED", "CANCELLED"));
        ALLOWED_STATUS_TRANSITIONS.put("COMPLETED", Set.of());
        ALLOWED_STATUS_TRANSITIONS.put("CANCELLED", Set.of());
    }

    @PostMapping
    @Transactional
    public ResponseEntity<CreateRoomResponse> createInterviewRoom(@RequestBody Map<String, String> request) {
        String title = request.get("title");
        String problemId = request.get("problemId");
        String interviewerId = request.get("interviewerId");
        String interviewerName = request.get("interviewerName");

        InterviewRoom room = new InterviewRoom();
        room.setTitle(title);
        room.setProblemId(problemId);
        room.setInterviewerId(interviewerId);
        room.setStatus("WAITING");
        room.setRoomCode(generateUniqueRoomCode());
        room.setCreatedAt(LocalDateTime.now());

        InterviewRoom savedRoom = interviewRoomRepository.save(room);

        ParticipantStatus interviewerStatus = new ParticipantStatus();
        interviewerStatus.setRoomId(savedRoom.getId());
        interviewerStatus.setUserId(interviewerId);
        interviewerStatus.setUserName(interviewerName);
        interviewerStatus.setUserRole("INTERVIEWER");
        interviewerStatus.setOnline(true);
        interviewerStatus.setLastHeartbeat(LocalDateTime.now());
        interviewerStatus.setJoinedAt(LocalDateTime.now());
        ParticipantStatus savedInterviewerStatus = participantStatusRepository.save(interviewerStatus);

        return new ResponseEntity<>(new CreateRoomResponse(savedRoom, savedInterviewerStatus), HttpStatus.CREATED);
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<InterviewRoom> getInterviewRoomById(@PathVariable String roomId) {
        Optional<InterviewRoom> room = interviewRoomRepository.findById(roomId);
        return room.map(ResponseEntity::ok)
                .orElseGet(() -> new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/code/{roomCode}")
    public ResponseEntity<InterviewRoom> getInterviewRoomByCode(@PathVariable String roomCode) {
        Optional<InterviewRoom> room = interviewRoomRepository.findByRoomCode(roomCode);
        return room.map(ResponseEntity::ok)
                .orElseGet(() -> new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/interviewer/{interviewerId}")
    public ResponseEntity<List<InterviewRoom>> getInterviewRoomsByInterviewer(@PathVariable String interviewerId) {
        List<InterviewRoom> rooms = interviewRoomRepository.findByInterviewerIdOrderByCreatedAtDesc(interviewerId);
        return new ResponseEntity<>(rooms, HttpStatus.OK);
    }

    @PutMapping("/{roomId}/status")
    @Transactional
    public ResponseEntity<InterviewRoom> updateRoomStatus(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String status = request.get("status");
        Optional<InterviewRoom> roomOpt = interviewRoomRepository.findById(roomId);

        if (roomOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        if (!ALLOWED_STATUS_TRANSITIONS.containsKey(status)) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        InterviewRoom room = roomOpt.get();
        String currentStatus = room.getStatus();

        // 幂等：重复提交相同状态直接返回当前房间
        if (currentStatus.equals(status)) {
            return new ResponseEntity<>(room, HttpStatus.OK);
        }

        Set<String> allowed = ALLOWED_STATUS_TRANSITIONS.get(currentStatus);
        if (allowed == null || !allowed.contains(status)) {
            // 状态不能倒退（含完成/取消互相切换）
            return new ResponseEntity<>(HttpStatus.CONFLICT);
        }

        room.setStatus(status);

        if ("ACTIVE".equals(status) && room.getStartedAt() == null) {
            room.setStartedAt(LocalDateTime.now());
        } else if (("COMPLETED".equals(status) || "CANCELLED".equals(status)) && room.getEndedAt() == null) {
            room.setEndedAt(LocalDateTime.now());
        }

        InterviewRoom updatedRoom = interviewRoomRepository.save(room);

        // 广播给房间内所有客户端，保证面试官列表、候选人详情看到的状态一致
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/status",
                new WebSocketMessage<>("ROOM_STATUS", updatedRoom));

        return new ResponseEntity<>(updatedRoom, HttpStatus.OK);
    }

    @GetMapping("/{roomId}/participants")
    public ResponseEntity<List<ParticipantStatus>> getRoomParticipants(@PathVariable String roomId) {
        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        return new ResponseEntity<>(participants, HttpStatus.OK);
    }

    @PostMapping("/{roomId}/join")
    @Transactional
    public ResponseEntity<JoinRoomResponse> joinRoom(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String candidateName = request.get("candidateName");
        String inviteToken = request.get("inviteToken");

        Optional<InterviewRoom> roomOpt = interviewRoomRepository.findById(roomId);
        if (roomOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
        InterviewRoom room = roomOpt.get();

        // 已完成或已取消的房间是终态，不允许候选人再加入
        if ("COMPLETED".equals(room.getStatus()) || "CANCELLED".equals(room.getStatus())) {
            return new ResponseEntity<>(HttpStatus.CONFLICT);
        }

        String message = "Joined via room code";

        if (inviteToken != null && !inviteToken.trim().isEmpty()) {
            Optional<CandidateInvitation> invitationOpt = candidateInvitationRepository.findByInviteToken(inviteToken);
            if (invitationOpt.isEmpty()) {
                return new ResponseEntity<>(HttpStatus.UNAUTHORIZED);
            }

            CandidateInvitation invitation = invitationOpt.get();
            if (!invitation.getRoomId().equals(roomId)) {
                return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
            }

            invitation.setStatus("JOINED");
            invitation.setJoinedAt(LocalDateTime.now());
            candidateInvitationRepository.save(invitation);
            message = "Joined via invitation token";
        }

        ParticipantStatus candidateStatus = new ParticipantStatus();
        candidateStatus.setRoomId(roomId);
        candidateStatus.setUserName(candidateName);
        candidateStatus.setUserRole("CANDIDATE");
        candidateStatus.setOnline(true);
        candidateStatus.setLastHeartbeat(LocalDateTime.now());
        candidateStatus.setJoinedAt(LocalDateTime.now());
        ParticipantStatus savedStatus = participantStatusRepository.save(candidateStatus);

        savedStatus.setUserId(savedStatus.getId());
        participantStatusRepository.save(savedStatus);

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        JoinRoomResponse response = new JoinRoomResponse(savedStatus, room, message);
        return new ResponseEntity<>(response, HttpStatus.OK);
    }

    @PostMapping("/{roomId}/leave")
    @Transactional
    public ResponseEntity<Void> leaveRoom(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String userId = request.get("userId");

        Optional<ParticipantStatus> statusOpt = participantStatusRepository.findByRoomIdAndUserId(roomId, userId);
        if (statusOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        ParticipantStatus status = statusOpt.get();
        status.setOnline(false);
        participantStatusRepository.save(status);

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        return new ResponseEntity<>(HttpStatus.OK);
    }

    @PostMapping("/{roomId}/heartbeat")
    @Transactional
    public ResponseEntity<ParticipantStatus> heartbeat(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String userId = request.get("userId");

        Optional<ParticipantStatus> statusOpt = participantStatusRepository.findByRoomIdAndUserId(roomId, userId);
        if (statusOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        ParticipantStatus status = statusOpt.get();
        status.setOnline(true);
        status.setLastHeartbeat(LocalDateTime.now());
        ParticipantStatus updatedStatus = participantStatusRepository.save(status);

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        return new ResponseEntity<>(updatedStatus, HttpStatus.OK);
    }

    private String generateUniqueRoomCode() {
        Random random = new Random();
        String code;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
                sb.append(ROOM_CODE_CHARS.charAt(random.nextInt(ROOM_CODE_CHARS.length())));
            }
            code = sb.toString();
        } while (interviewRoomRepository.existsByRoomCode(code));
        return code;
    }
}
