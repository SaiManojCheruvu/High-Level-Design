package com.collabnotes.gateway;

import com.collabnotes.document.DocumentService;
import com.collabnotes.document.Operation;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketController extends TextWebSocketHandler {

    @Autowired
    private DocumentService documentService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, List<WebSocketSession>> documentSessions = new ConcurrentHashMap<>();
    private final Map<String, String> sessionUsers = new ConcurrentHashMap<>();
    private final Map<String, String> usernames = new ConcurrentHashMap<>(); // userId -> username

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String documentId = extractQueryParam(session, "documentId");
        String userId = extractQueryParam(session, "userId");
        String username = extractQueryParam(session, "username");

        if (documentId != null && userId != null) {
            sessionUsers.put(session.getId(), userId);
            
            // Store username if provided
            if (username != null && !username.isEmpty()) {
                try {
                    String decodedUsername = java.net.URLDecoder.decode(username, "UTF-8");
                    usernames.put(userId, decodedUsername);
                    System.out.println("Stored username for " + userId + ": " + decodedUsername);
                } catch (Exception e) {
                    System.err.println("Error decoding username: " + e.getMessage());
                }
            }

            // Add session to document room
            documentSessions.computeIfAbsent(documentId, k -> new ArrayList<>())
                    .add(session);

            System.out.println("User " + userId + " connected to document " + documentId +
                    " (Session: " + session.getId() + ")");

            // Send all applied ops on connect
            sendAllAppliedOpsOnConnect(session, documentId);

            // Send all existing usernames to the new user
            sendExistingUsernames(session, documentId);

            // Notify other users (with username)
            broadcastUserJoined(documentId, userId);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String documentId = extractQueryParam(session, "documentId");
        String userId = sessionUsers.get(session.getId());

        if (documentId != null && userId != null) {
            try {
                String payload = message.getPayload();
                System.out.println("Received WebSocket message from user " + userId +
                        " for document " + documentId + ": " + payload);

                Map<String, Object> messageMap = objectMapper.readValue(payload, Map.class);
                String type = (String) messageMap.get("type");

                if ("OPERATION".equals(type)) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> opData = (Map<String, Object>) messageMap.get("operation");

                    Operation operation = new Operation();
                    operation.setDocumentId(documentId);
                    operation.setUserId(userId);
                    operation.setType((String) opData.get("type"));
                    operation.setPosition(((Number) opData.get("position")).intValue());
                    operation.setText((String) opData.get("text"));
                    operation.setTimestamp(System.currentTimeMillis());

                    System.out.println("Processing operation: " + operation.getType() +
                            " at position " + operation.getPosition() +
                            " with text: " + operation.getText());

                    // Process operation through Document Service
                    Operation processedOp = documentService.processOperation(operation);

                    // Broadcast to all other sessions in this document
                    broadcastOperation(processedOp, documentId, session);
                } else if ("CURSOR_POSITION".equals(type)) {
                    // Broadcast cursor position to other users
                    broadcastCursorPosition(documentId, userId, messageMap, session);
                } else if ("USER_INFO".equals(type)) {
                    // Store username and broadcast to others
                    String username = (String) messageMap.get("username");
                    if (username != null) {
                        usernames.put(userId, username);
                        System.out.println("Stored username for " + userId + ": " + username);
                        broadcastUserInfo(documentId, userId, username, session);
                    }
                } else if ("NEW_DOCUMENT".equals(type)) {
                    // Broadcast new document to all users
                    System.out.println("Broadcasting new document creation");
                    broadcastNewDocument(messageMap, session);
                }

            } catch (Exception e) {
                System.err.println("Error processing WebSocket message: " + e.getMessage());
                sendError(session, "Failed to process operation: " + e.getMessage());
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String documentId = extractQueryParam(session, "documentId");
        String userId = sessionUsers.remove(session.getId());

        if (documentId != null && userId != null) {
            List<WebSocketSession> sessions = documentSessions.get(documentId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    documentSessions.remove(documentId);
                }
            }

            System.out.println("User " + userId + " disconnected from document " + documentId);
            broadcastUserLeft(documentId, userId);
        }
    }

    private void sendAllAppliedOpsOnConnect(WebSocketSession session, String documentId) throws IOException {
        System.out.println("Sending all applied ops on connect for document: " + documentId);

        List<Operation> appliedOps = documentService.getAllAppliedOperations(documentId);
        System.out.println("Found " + appliedOps.size() + " applied operations");

        Map<String, Object> initMessage = new HashMap<>();
        initMessage.put("type", "INITIALIZATION");
        initMessage.put("documentId", documentId);
        initMessage.put("operations", appliedOps);

        String json = objectMapper.writeValueAsString(initMessage);
        session.sendMessage(new TextMessage(json));

        // Also send current user list
        sendUserList(documentId);
    }

    private void broadcastOperation(Operation operation, String documentId, WebSocketSession sender) {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            System.out.println("Broadcasting operation to " + (sessions.size() - 1) + " other users");

            Map<String, Object> message = new HashMap<>();
            message.put("type", "OPERATION");
            message.put("operation", operation);

            try {
                String json = objectMapper.writeValueAsString(message);

                for (WebSocketSession session : sessions) {
                    if (session != sender && session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                System.err.println("Failed to broadcast operation: " + e.getMessage());
            }
        }
    }

    private void broadcastUserJoined(String documentId, String userId) {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("type", "USER_JOINED");
            message.put("userId", userId);
            message.put("username", usernames.get(userId)); // Include username if available
            message.put("timestamp", System.currentTimeMillis());

            try {
                String json = objectMapper.writeValueAsString(message);

                for (WebSocketSession session : sessions) {
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                System.err.println("Failed to broadcast user joined: " + e.getMessage());
            }
        }
    }

    private void broadcastUserLeft(String documentId, String userId) {
        broadcastUserEvent(documentId, "USER_LEFT", userId);
    }

    private void broadcastUserEvent(String documentId, String eventType, String userId) {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("type", eventType);
            message.put("userId", userId);
            message.put("timestamp", System.currentTimeMillis());

            try {
                String json = objectMapper.writeValueAsString(message);

                for (WebSocketSession session : sessions) {
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                System.err.println("Failed to broadcast user event: " + e.getMessage());
            }
        }
    }

    private void broadcastCursorPosition(String documentId, String userId, Map<String, Object> messageMap, WebSocketSession sender) {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("type", "CURSOR_POSITION");
            message.put("userId", userId);
            message.put("username", messageMap.get("username"));
            message.put("position", messageMap.get("position"));

            try {
                String json = objectMapper.writeValueAsString(message);

                for (WebSocketSession session : sessions) {
                    if (session != sender && session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                System.err.println("Failed to broadcast cursor position: " + e.getMessage());
            }
        }
    }

    private void broadcastUserInfo(String documentId, String userId, String username, WebSocketSession sender) {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("type", "USER_JOINED");
            message.put("userId", userId);
            message.put("username", username);

            try {
                String json = objectMapper.writeValueAsString(message);

                for (WebSocketSession session : sessions) {
                    if (session != sender && session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                    }
                }
            } catch (IOException e) {
                System.err.println("Failed to broadcast user info: " + e.getMessage());
            }
        }
    }

    private void sendExistingUsernames(WebSocketSession session, String documentId) throws IOException {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            // Collect all usernames for users in this document
            Map<String, String> documentUsernames = new HashMap<>();
            
            for (WebSocketSession otherSession : sessions) {
                String otherUserId = sessionUsers.get(otherSession.getId());
                if (otherUserId != null) {
                    String username = usernames.get(otherUserId);
                    if (username != null) {
                        documentUsernames.put(otherUserId, username);
                    }
                }
            }

            if (!documentUsernames.isEmpty()) {
                Map<String, Object> message = new HashMap<>();
                message.put("type", "EXISTING_USERNAMES");
                message.put("usernames", documentUsernames);

                String json = objectMapper.writeValueAsString(message);
                session.sendMessage(new TextMessage(json));
                
                System.out.println("Sent " + documentUsernames.size() + " existing usernames to new user");
            }
        }
    }

    private void broadcastNewDocument(Map<String, Object> messageMap, WebSocketSession sender) {
        // Broadcast to all sessions across all documents
        Map<String, Object> message = new HashMap<>();
        message.put("type", "NEW_DOCUMENT");
        message.put("document", messageMap.get("document"));

        try {
            String json = objectMapper.writeValueAsString(message);
            int broadcastCount = 0;

            // Send to all sessions in all documents
            for (List<WebSocketSession> sessions : documentSessions.values()) {
                for (WebSocketSession session : sessions) {
                    if (session != sender && session.isOpen()) {
                        session.sendMessage(new TextMessage(json));
                        broadcastCount++;
                    }
                }
            }

            System.out.println("Broadcasted new document to " + broadcastCount + " users");
        } catch (IOException e) {
            System.err.println("Failed to broadcast new document: " + e.getMessage());
        }
    }

    private void sendUserList(String documentId) throws IOException {
        List<WebSocketSession> sessions = documentSessions.get(documentId);

        if (sessions != null && !sessions.isEmpty()) {
            List<String> users = new ArrayList<>();

            for (WebSocketSession session : sessions) {
                String userId = sessionUsers.get(session.getId());
                if (userId != null) {
                    users.add(userId);
                }
            }

            Map<String, Object> message = new HashMap<>();
            message.put("type", "USER_LIST");
            message.put("users", users);

            String json = objectMapper.writeValueAsString(message);

            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                }
            }
        }
    }

    private void sendError(WebSocketSession session, String errorMessage) throws IOException {
        Map<String, Object> error = new HashMap<>();
        error.put("type", "ERROR");
        error.put("message", errorMessage);

        String json = objectMapper.writeValueAsString(error);
        session.sendMessage(new TextMessage(json));
    }

    private String extractQueryParam(WebSocketSession session, String paramName) {
        String query = session.getUri().getQuery();
        if (query != null) {
            String[] params = query.split("&");
            for (String param : params) {
                if (param.startsWith(paramName + "=")) {
                    return param.substring(paramName.length() + 1);
                }
            }
        }
        return null;
    }
}