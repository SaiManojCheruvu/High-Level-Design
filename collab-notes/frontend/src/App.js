import React, { useState, useEffect, useRef } from "react";
import "./App.css";

function App() {
  const [username, setUsername] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [operations, setOperations] = useState([]);
  const [documentContent, setDocumentContent] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [cursorPositions, setCursorPositions] = useState({});
  const [usernames, setUsernames] = useState({}); // Map userId -> username

  const userDataRef = useRef(null);
  const wsRef = useRef(null);
  const globalWsRef = useRef(null); // Global WebSocket for document list updates
  const textEditorRef = useRef(null);
  const lastContentRef = useRef("");
  const pendingOperations = useRef(new Set());
  const reconnectTimeoutRef = useRef(null);
  const cursorUpdateTimeoutRef = useRef(null);
  const currentDocumentRef = useRef(null);
  const pendingCursorPositionRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("collabnotes_user");
    if (savedUser) {
      try {
        userDataRef.current = JSON.parse(savedUser);
        setLoggedIn(true);
        fetchDocuments();
        connectGlobalWebSocket(); // Connect to global WebSocket for broadcasts
      } catch (e) {
        localStorage.removeItem("collabnotes_user");
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnectWebSocket();
      disconnectGlobalWebSocket();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectGlobalWebSocket = () => {
    if (!userDataRef.current) return;

    const userId = userDataRef.current.userId;
    const username = encodeURIComponent(userDataRef.current.displayName || "Unknown");
    const wsUrl = `ws://localhost:8081/api/ws?documentId=global&userId=${encodeURIComponent(userId)}&username=${username}`;
    
    console.log("Connecting to global WebSocket for broadcasts:", wsUrl);

    const ws = new WebSocket(wsUrl);
    globalWsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ Global WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📨 Global broadcast received:", message);
        
        if (message.type === "NEW_DOCUMENT") {
          console.log("📄 New document broadcast received:", message.document);
          if (message.document) {
            setDocuments((prev) => {
              const exists = prev.some(doc => doc.id === message.document.id);
              if (!exists) {
                console.log("Adding new document to list");
                return [...prev, message.document];
              }
              return prev;
            });
          }
        }
      } catch (error) {
        console.error("Error parsing global WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("Global WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Global WebSocket disconnected");
      // Attempt to reconnect after 3 seconds if still logged in
      if (userDataRef.current) {
        setTimeout(() => {
          console.log("Reconnecting global WebSocket...");
          connectGlobalWebSocket();
        }, 3000);
      }
    };
  };

  const disconnectGlobalWebSocket = () => {
    if (globalWsRef.current) {
      globalWsRef.current.close();
      globalWsRef.current = null;
    }
  };

  // Apply pending cursor position after content updates
  useEffect(() => {
    if (pendingCursorPositionRef.current && textEditorRef.current) {
      const { start, end } = pendingCursorPositionRef.current;
      console.log("Applying pending cursor position:", start, "to", end);
      textEditorRef.current.selectionStart = start;
      textEditorRef.current.selectionEnd = end;
      pendingCursorPositionRef.current = null;
    }
  }, [documentContent]);

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      alert("Please enter a username");
      return;
    }

    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const displayName = username.trim();
    const userData = {
      userId,
      username: displayName,
      displayName: displayName,
      avatar: displayName.charAt(0).toUpperCase(),
    };

    userDataRef.current = userData;
    localStorage.setItem("collabnotes_user", JSON.stringify(userData));
    setLoggedIn(true);
    fetchDocuments();
    connectGlobalWebSocket(); // Connect to global WebSocket
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/docs");
      if (response.ok) {
        const data = await response.json();
        console.log("Fetched documents:", data);
        setDocuments(data);
      } else {
        console.error("Failed to fetch documents:", response.status);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
    setLoading(false);
  };

  const createDocument = async () => {
    const title = prompt("Enter document title:");
    if (!title || !title.trim()) return;

    try {
      const response = await fetch("/api/docs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          createdBy: userDataRef.current?.userId || "anonymous",
          createdByName: userDataRef.current?.displayName || userDataRef.current?.username || "Unknown",
        }),
      });

      if (response.ok) {
        const newDoc = await response.json();
        console.log("Created document:", newDoc);
        setDocuments((prev) => [...prev, newDoc]);
        
        // Broadcast new document to other users via global WebSocket
        if (globalWsRef.current && globalWsRef.current.readyState === WebSocket.OPEN) {
          const message = {
            type: "NEW_DOCUMENT",
            document: newDoc,
          };
          console.log("Broadcasting new document via global WebSocket");
          globalWsRef.current.send(JSON.stringify(message));
        } else {
          console.warn("Global WebSocket not connected, cannot broadcast new document");
        }
        
        selectDocument(newDoc.id);
      } else {
        const errorText = await response.text();
        alert(`Failed to create document: ${errorText}`);
      }
    } catch (error) {
      console.error("Error creating document:", error);
      alert("Error creating document: " + error.message);
    }
  };

  const selectDocument = async (documentId) => {
    // Disconnect from current document
    disconnectWebSocket();

    const doc = documents.find((d) => d.id === documentId);
    if (!doc) {
      console.error("Document not found:", documentId);
      return;
    }

    setCurrentDocument(doc);
    currentDocumentRef.current = doc; // Keep ref in sync
    setDocumentContent("");
    setConnectedUsers([userDataRef.current?.userId]);
    setOperations([]);
    setCursorPositions({});
    setConnectionStatus("connecting");
    lastContentRef.current = "";

    // Connect via WebSocket
    connectToDocument(documentId);
  };

  const connectToDocument = (documentId) => {
    if (!userDataRef.current || !documentId) return;

    disconnectWebSocket();

    const userId = userDataRef.current.userId;
    const username = encodeURIComponent(userDataRef.current.displayName || userDataRef.current.username || "Unknown");
    const wsUrl = `ws://localhost:8081/api/ws?documentId=${encodeURIComponent(documentId)}&userId=${encodeURIComponent(userId)}&username=${username}`;
    console.log("Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected to document:", documentId);
      setConnectionStatus("connected");
      pendingOperations.current.clear();
      
      // Send user info to other clients
      const userInfoMessage = {
        type: "USER_INFO",
        userId: userDataRef.current.userId,
        username: userDataRef.current.displayName,
      };
      ws.send(JSON.stringify(userInfoMessage));
    };

    ws.onclose = (event) => {
      console.log("❌ WebSocket disconnected:", event.code, event.reason);
      setConnectionStatus("disconnected");

      // Clear reconnect timeout if exists
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Try to reconnect after 3 seconds if still on this document
      if (currentDocument && currentDocument.id === documentId) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connectToDocument(documentId);
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("error");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📨 Received WebSocket message:", message);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error(
          "Error parsing WebSocket message:",
          error,
          "Raw:",
          event.data,
        );
      }
    };
  };

  const handleWebSocketMessage = (message) => {
    console.log("📨 RAW WebSocket message received:", message);
    
    switch (message.type) {
      case "INITIALIZATION":
        console.log("📋 Initialization data:", message);
        if (message.operations && Array.isArray(message.operations)) {
          const validOps = message.operations.filter((op) => op.applied);
          setOperations(validOps);
          rebuildDocumentContent(validOps);
        }
        if (message.users) {
          setConnectedUsers(message.users);
        }
        break;

      case "OPERATION":
        console.log("🔄 Received OPERATION message");
        const operation = message.operation;
        console.log("Operation details:", {
          type: operation.type,
          position: operation.position,
          text: operation.text,
          userId: operation.userId,
          documentId: operation.documentId,
          myUserId: userDataRef.current?.userId,
          currentDocId: currentDocumentRef.current?.id
        });
        
        // Use ref instead of state to avoid stale closure
        if (operation.documentId === currentDocumentRef.current?.id) {
          console.log("✅ Document ID matches!");
          
          // Only apply operations from OTHER users
          if (operation.userId !== userDataRef.current?.userId) {
            console.log("✅ Operation from OTHER user - applying:", operation.userId);
            
            // Save cursor position BEFORE applying operation
            const cursorPosition = textEditorRef.current?.selectionStart || 0;
            const cursorEnd = textEditorRef.current?.selectionEnd || 0;
            
            console.log("Current cursor position:", cursorPosition, "Operation at:", operation.position);
            
            // Calculate new cursor position
            let newCursorPos = cursorPosition;
            let newCursorEnd = cursorEnd;
            
            if (operation.type === "INSERT") {
              // If insertion happened before or at cursor, shift cursor right
              if (operation.position <= cursorPosition) {
                newCursorPos = cursorPosition + operation.text.length;
                newCursorEnd = cursorEnd + operation.text.length;
                console.log("INSERT before cursor: shifting from", cursorPosition, "to", newCursorPos);
              }
            } else if (operation.type === "DELETE") {
              const deleteEnd = operation.position + operation.text.length;
              
              if (deleteEnd <= cursorPosition) {
                // Deletion entirely before cursor
                newCursorPos = cursorPosition - operation.text.length;
                newCursorEnd = cursorEnd - operation.text.length;
                console.log("DELETE before cursor: shifting from", cursorPosition, "to", newCursorPos);
              } else if (operation.position < cursorPosition) {
                // Deletion overlaps cursor
                newCursorPos = operation.position;
                newCursorEnd = operation.position;
                console.log("DELETE overlaps cursor: moving to", newCursorPos);
              }
            }
            
            // Store the new cursor position to be applied after render
            pendingCursorPositionRef.current = { start: newCursorPos, end: newCursorEnd };
            
            // Apply to content immediately
            if (operation.applied !== false) {
              console.log("Applying operation NOW!");
              
              setDocumentContent((prev) => {
                console.log("Before operation - content length:", prev.length);
                const newContent = applyOperationToContent(prev, operation);
                console.log("After operation - content length:", newContent.length);
                lastContentRef.current = newContent;
                return newContent;
              });
            } else {
              console.log("⚠️ Operation marked as not applied, skipping");
            }
          } else {
            console.log("⏭️ Skipping my own operation");
          }
          
          // Add to operations list for history
          setOperations((prev) => [...prev, operation]);
        } else {
          console.log("❌ Document ID mismatch! Operation doc:", operation.documentId, "Current doc:", currentDocumentRef.current?.id);
        }
        break;

      case "CURSOR_POSITION":
        console.log("👆 Cursor position update:", message);
        if (message.userId !== userDataRef.current?.userId) {
          setCursorPositions((prev) => ({
            ...prev,
            [message.userId]: {
              position: message.position,
              username: message.username,
            },
          }));
          // Also store username
          if (message.username) {
            setUsernames((prev) => ({
              ...prev,
              [message.userId]: message.username,
            }));
          }
        }
        break;

      case "USER_JOINED":
        console.log("👤 User joined:", message.userId);
        setConnectedUsers((prev) => {
          if (!prev.includes(message.userId)) {
            return [...prev, message.userId];
          }
          return prev;
        });
        // Store username if provided
        if (message.username) {
          setUsernames((prev) => ({
            ...prev,
            [message.userId]: message.username,
          }));
        }
        break;

      case "USER_LEFT":
        console.log("👋 User left:", message.userId);
        setConnectedUsers((prev) =>
          prev.filter((userId) => userId !== message.userId),
        );
        setCursorPositions((prev) => {
          const updated = { ...prev };
          delete updated[message.userId];
          return updated;
        });
        break;

      case "USER_LIST":
        console.log("📋 User list:", message.users);
        setConnectedUsers(message.users || []);
        break;

      case "EXISTING_USERNAMES":
        console.log("📋 Received existing usernames:", message.usernames);
        if (message.usernames) {
          setUsernames((prev) => ({
            ...prev,
            ...message.usernames,
          }));
        }
        break;

      case "NEW_DOCUMENT":
        console.log("📄 New document created:", message.document);
        if (message.document) {
          setDocuments((prev) => {
            // Check if document already exists
            const exists = prev.some(doc => doc.id === message.document.id);
            if (!exists) {
              return [...prev, message.document];
            }
            return prev;
          });
        }
        break;

      case "ERROR":
        console.error("❌ WebSocket error:", message.message);
        break;

      default:
        console.log("❓ Unknown message type:", message.type);
    }
  };

  const applyOperationToContent = (content, operation) => {
    let result = content;

    try {
      if (operation.type === "INSERT") {
        if (operation.position <= result.length) {
          result =
            result.slice(0, operation.position) +
            operation.text +
            result.slice(operation.position);
        } else {
          result += operation.text;
        }
      } else if (operation.type === "DELETE") {
        if (operation.position < result.length) {
          const endPos = Math.min(
            operation.position + (operation.text?.length || 1),
            result.length,
          );
          result = result.slice(0, operation.position) + result.slice(endPos);
        }
      }
    } catch (error) {
      console.error("Error applying operation:", error, operation);
    }

    return result;
  };

  const rebuildDocumentContent = (ops) => {
    console.log("Rebuilding document from", ops.length, "operations");
    let content = "";
    ops.forEach((op) => {
      if (op.applied !== false) {
        content = applyOperationToContent(content, op);
      }
    });
    console.log("Rebuilt content length:", content.length);
    setDocumentContent(content);
    lastContentRef.current = content;
  };

  const handleTextChange = (e) => {
    const newContent = e.target.value;
    const oldContent = lastContentRef.current;

    // Clear any pending cursor position from remote operations
    // because user is actively typing
    pendingCursorPositionRef.current = null;

    // Update local content immediately
    setDocumentContent(newContent);
    lastContentRef.current = newContent;

    // Don't send if WebSocket is not connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected, not sending operation");
      return;
    }

    // Simple diff algorithm
    let position = 0;
    let text = "";

    // Find first difference
    while (
      position < oldContent.length &&
      position < newContent.length &&
      oldContent[position] === newContent[position]
    ) {
      position++;
    }

    if (newContent.length > oldContent.length) {
      // Insertion
      text = newContent.slice(
        position,
        position + (newContent.length - oldContent.length),
      );
      if (text) {
        sendOperation({
          type: "INSERT",
          position: position,
          text: text,
          timestamp: Date.now(),
        });
      }
    } else if (newContent.length < oldContent.length) {
      // Deletion
      const deleteLength = oldContent.length - newContent.length;
      text = oldContent.slice(position, position + deleteLength);
      if (text) {
        sendOperation({
          type: "DELETE",
          position: position,
          text: text,
          timestamp: Date.now(),
        });
      }
    }
  };

  const handleCursorChange = () => {
    if (!textEditorRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const position = textEditorRef.current.selectionStart;

    // Clear existing timeout
    if (cursorUpdateTimeoutRef.current) {
      clearTimeout(cursorUpdateTimeoutRef.current);
    }

    // Debounce cursor updates
    cursorUpdateTimeoutRef.current = setTimeout(() => {
      sendCursorPosition(position);
    }, 100);
  };

  const sendCursorPosition = (position) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !currentDocumentRef.current) {
      return;
    }

    const message = {
      type: "CURSOR_POSITION",
      documentId: currentDocumentRef.current.id,
      userId: userDataRef.current.userId,
      username: userDataRef.current.displayName,
      position: position,
    };

    try {
      wsRef.current.send(JSON.stringify(message));
    } catch (error) {
      console.error("Error sending cursor position:", error);
    }
  };

  const sendOperation = (operationData) => {
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN ||
      !currentDocumentRef.current
    ) {
      console.warn("Cannot send operation: WebSocket not ready");
      return;
    }

    const operation = {
      ...operationData,
      documentId: currentDocumentRef.current.id,
      userId: userDataRef.current.userId,
      version: operations.length + 1,
    };

    const message = {
      type: "OPERATION",
      operation: operation,
    };

    try {
      wsRef.current.send(JSON.stringify(message));
      console.log("📤 Sent operation:", operation);
    } catch (error) {
      console.error("Error sending operation:", error);
    }
  };

  const handleLogout = () => {
    disconnectWebSocket();
    disconnectGlobalWebSocket();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    localStorage.removeItem("collabnotes_user");
    userDataRef.current = null;
    setLoggedIn(false);
    setUsername("");
    setDocuments([]);
    setCurrentDocument(null);
    setConnectedUsers([]);
    setOperations([]);
    setDocumentContent("");
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "#4CAF50";
      case "connecting":
        return "#FFC107";
      case "disconnected":
        return "#F44336";
      case "error":
        return "#F44336";
      default:
        return "#9E9E9E";
    }
  };

  const formatUserId = (userId) => {
    if (!userId) return "Unknown";
    if (userId === userDataRef.current?.userId) return "You";

    // Extract username from userId if it follows our pattern
    const match = userId.match(/user-\d+-([a-z0-9]+)/);
    return match ? `User-${match[1].toUpperCase()}` : userId;
  };

  if (!loggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>📝 Collaborative Notes</h1>
          <p>Real-time document collaboration</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="form-input"
                autoFocus
                maxLength="20"
              />
            </div>
            <button type="submit" className="login-button">
              Start Collaborating
            </button>
          </form>

          <div className="login-info">
            <p>
              💡 <strong>Demo Instructions:</strong>
            </p>
            <ol
              style={{
                textAlign: "left",
                margin: "10px 0",
                paddingLeft: "20px",
              }}
            >
              <li>Open this page in two browser tabs</li>
              <li>Use different usernames in each tab</li>
              <li>Create or select the same document</li>
              <li>Start typing - see changes in real-time!</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <h1>Collaborative Notes</h1>
          {currentDocument && (
            <div className="current-doc-info">
              <span className="doc-title">{currentDocument.title}</span>
              <span className="connection-status">
                <span
                  className="status-dot"
                  style={{ background: getConnectionStatusColor() }}
                ></span>
                {connectionStatus.toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="user-section">
          <div className="user-avatar-small">
            {userDataRef.current?.avatar || "U"}
          </div>
          <span className="username">{userDataRef.current?.displayName}</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="sidebar">
          <div className="documents-section">
            <h2>Documents</h2>
            <button className="new-doc-button" onClick={createDocument}>
              + New Document
            </button>

            {loading ? (
              <div className="loading">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <p>No documents yet</p>
                <button
                  onClick={createDocument}
                  style={{ marginTop: "10px", padding: "8px 16px" }}
                >
                  Create your first document
                </button>
              </div>
            ) : (
              <div className="documents-list">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`document-item ${currentDocument?.id === doc.id ? "active" : ""}`}
                    onClick={() => selectDocument(doc.id)}
                  >
                    <div className="document-title">{doc.title}</div>
                    <div className="document-meta">
                      <span className="doc-author">
                        By: {doc.createdByName || formatUserId(doc.createdBy) || "Unknown"}
                      </span>
                      <span className="doc-date">
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {currentDocument && (
            <div className="users-section">
              <h3>
                Active Users
                <span className="user-count"> ({connectedUsers.length})</span>
              </h3>
              <div className="users-list">
                {connectedUsers.map((userId) => {
                  const cursorInfo = cursorPositions[userId];
                  const isCurrentUser = userId === userDataRef.current?.userId;
                  
                  // Get username from multiple sources
                  let displayName;
                  if (isCurrentUser) {
                    displayName = userDataRef.current?.displayName || "You";
                  } else {
                    displayName = usernames[userId] || cursorInfo?.username || formatUserId(userId);
                  }
                  
                  return (
                    <div
                      key={userId}
                      className={`user-item ${isCurrentUser ? "current-user" : ""}`}
                    >
                      <span className="user-dot"></span>
                      <div className="user-info">
                        <span className="user-name">
                          {displayName}
                          {isCurrentUser && " (You)"}
                        </span>
                        {!isCurrentUser && cursorInfo && (
                          <span className="user-cursor-pos" title="Cursor position">
                            📍 Position {cursorInfo.position}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="editor-area">
          {currentDocument ? (
            <>
              <div className="editor-container">
                <div className="editor-header">
                  <h3>Editing: {currentDocument.title}</h3>
                  <div className="editor-stats">
                    <span className="char-count">
                      {documentContent.length} characters
                    </span>
                    <span className="ops-count">
                      {operations.length} operations
                    </span>
                    <span className="users-count">
                      {connectedUsers.length} users
                    </span>
                  </div>
                </div>
                <textarea
                  ref={textEditorRef}
                  className="text-editor"
                  value={documentContent}
                  onChange={handleTextChange}
                  onSelect={handleCursorChange}
                  onKeyUp={handleCursorChange}
                  onClick={handleCursorChange}
                  placeholder={
                    connectionStatus === "connected"
                      ? "Start typing here... Changes will sync with other users in real-time"
                      : "Connecting to server..."
                  }
                  disabled={connectionStatus !== "connected"}
                  rows={20}
                  spellCheck="true"
                />
              </div>

              <div className="operations-history">
                <h4>Recent Operations ({operations.length})</h4>
                {operations.length === 0 ? (
                  <div className="no-operations">
                    No operations yet. Start typing!
                  </div>
                ) : (
                  <div className="operations-list">
                    {operations
                      .slice(-10)
                      .reverse()
                      .map((op, idx) => (
                        <div
                          key={operations.length - idx}
                          className="operation-item"
                        >
                          <span className={`operation-type ${op.type}`}>
                            {op.type === "INSERT" ? "➕" : "🗑️"} {op.type}
                          </span>
                          <span className="operation-user">
                            {formatUserId(op.userId)}:
                          </span>
                          <span className="operation-text">
                            "{op.text?.substring(0, 20) || "[no text]"}"
                          </span>
                          <span className="operation-position">
                            at pos {op.position}
                          </span>
                          <span className="operation-time">
                            {new Date(op.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="editor-placeholder">
              <h2>Welcome to Collaborative Notes!</h2>
              <div className="demo-card">
                <h3>🚀 Real-time Collaboration Demo</h3>
                <p>Test the real-time features:</p>
                <ol>
                  <li>
                    <strong>Create a document</strong> using the button in the
                    sidebar
                  </li>
                  <li>
                    <strong>Open this URL</strong> in another browser tab/window
                  </li>
                  <li>
                    <strong>Use a different username</strong> when logging in
                  </li>
                  <li>
                    <strong>Select the same document</strong> in both tabs
                  </li>
                  <li>
                    <strong>Start typing</strong> - see changes appear instantly
                    in both tabs!
                  </li>
                </ol>

                <div className="feature-list">
                  <h4>✨ Features:</h4>
                  <ul>
                    <li>Real-time text synchronization</li>
                    <li>Live user presence display</li>
                    <li>Operation history tracking</li>
                    <li>Automatic reconnection</li>
                    <li>Conflict resolution with Operational Transformation</li>
                  </ul>
                </div>
              </div>

              <div className="tech-stack">
                <h4>🛠️ Tech Stack:</h4>
                <div className="tech-tags">
                  <span className="tech-tag">Spring Boot</span>
                  <span className="tech-tag">WebSocket</span>
                  <span className="tech-tag">PostgreSQL</span>
                  <span className="tech-tag">MongoDB</span>
                  <span className="tech-tag">Zookeeper</span>
                  <span className="tech-tag">React</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
