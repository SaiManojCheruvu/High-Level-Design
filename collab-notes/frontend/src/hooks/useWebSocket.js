import { useState, useEffect, useCallback, useRef } from "react";

export const useWebSocket = (userId) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [operations, setOperations] = useState([]);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [currentDocumentId, setCurrentDocumentId] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  const connect = useCallback(
    (documentId) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        !userId ||
        !documentId
      ) {
        return;
      }

      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Change to use backend port 8081
      const wsUrl = `ws://localhost:8081/api/ws?documentId=${documentId}&userId=${userId}`;

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          setIsConnecting(false);
          setCurrentDocumentId(documentId);

          // Start heartbeat
          heartbeatIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "PING" }));
            }
          }, 30000);
        };

        wsRef.current.onclose = (event) => {
          console.log("WebSocket disconnected:", event.code, event.reason);
          setIsConnected(false);
          setIsConnecting(false);

          // Clear heartbeat
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }

          // Attempt reconnection after delay
          if (documentId) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect(documentId);
            }, 3000);
          }
        };

        wsRef.current.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnected(false);
          setIsConnecting(false);
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };
      } catch (error) {
        console.error("Error creating WebSocket:", error);
        setIsConnecting(false);
      }
    },
    [userId],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setCurrentDocumentId(null);
    setOperations([]);
    setConnectedUsers([]);
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    switch (message.type) {
      case "INITIALIZATION":
        console.log(
          "Received initialization data:",
          message.operations?.length || 0,
          "operations",
        );
        setOperations(message.operations || []);
        break;

      case "OPERATION":
        console.log("Received operation:", message.operation);
        setOperations((prev) => [...prev, message.operation]);
        break;

      case "USER_JOINED":
        console.log("User joined:", message.userId);
        setConnectedUsers((prev) => [...prev, message.userId]);
        break;

      case "USER_LEFT":
        console.log("User left:", message.userId);
        setConnectedUsers((prev) =>
          prev.filter((user) => user !== message.userId),
        );
        break;

      case "USER_LIST":
        console.log("User list updated:", message.users);
        setConnectedUsers(message.users || []);
        break;

      case "ERROR":
        console.error("WebSocket error:", message.message);
        break;

      case "PONG":
        // Heartbeat response
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  }, []);

  const sendOperation = useCallback((operation) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: "OPERATION",
        operation: {
          type: operation.type,
          position: operation.position,
          text: operation.text,
          documentId: operation.documentId,
          timestamp: operation.timestamp,
        },
      };
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("Cannot send operation: WebSocket not connected");
    }
  }, []);

  const connectToDocument = useCallback(
    (documentId) => {
      disconnect();
      connect(documentId);
    },
    [connect, disconnect],
  );

  const disconnectFromDocument = useCallback(
    (documentId) => {
      if (currentDocumentId === documentId) {
        disconnect();
      }
    },
    [currentDocumentId, disconnect],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    operations,
    connectedUsers,
    currentDocumentId,
    sendOperation,
    connectToDocument,
    disconnectFromDocument,
  };
};
