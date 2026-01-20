import React, { useState, useEffect, useRef, useCallback } from "react";
import { applyOperation, generateOperations } from "../utils/ot";

const DocumentEditor = ({ document, onOperation, operations, isConnected }) => {
  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(true);
  const textareaRef = useRef(null);
  const lastContentRef = useRef("");

  // Initialize content from operations
  useEffect(() => {
    if (operations.length > 0) {
      let initialContent = "";
      operations.forEach((op) => {
        if (op.applied) {
          initialContent = applyOperation(initialContent, op);
        }
      });
      setContent(initialContent);
      lastContentRef.current = initialContent;
    } else {
      setContent("");
      lastContentRef.current = "";
    }
  }, [document.id]);

  // Apply incoming operations
  useEffect(() => {
    if (operations.length === 0) return;

    const lastOperation = operations[operations.length - 1];
    if (lastOperation && lastOperation.applied) {
      const newContent = applyOperation(content, lastOperation);
      if (newContent !== content) {
        setContent(newContent);
        lastContentRef.current = newContent;
      }
    }
  }, [operations]);

  const handleContentChange = useCallback(
    (e) => {
      if (!isConnected || !isEditing) return;

      const newContent = e.target.value;
      const oldContent = lastContentRef.current;

      // Generate operations based on difference
      const generatedOps = generateOperations(oldContent, newContent);

      // Send each operation
      generatedOps.forEach((op) => {
        if (op.type === "INSERT" || op.type === "DELETE") {
          onOperation(op.type, op.position, op.text);
        }
      });

      setContent(newContent);
      lastContentRef.current = newContent;
    },
    [isConnected, isEditing, onOperation],
  );

  const handleKeyDown = useCallback(
    (e) => {
      // Handle special keys if needed
      if (e.key === "Tab") {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const newValue =
          content.substring(0, start) + "  " + content.substring(end);
        setContent(newValue);

        // Set cursor position after tab
        setTimeout(() => {
          textareaRef.current.selectionStart =
            textareaRef.current.selectionEnd = start + 2;
        }, 0);
      }
    },
    [content],
  );

  const handleSelectionChange = useCallback(() => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      // Could send cursor position to server here for collaborative cursors
    }
  }, []);

  if (!document) {
    return (
      <div className="empty-state">
        <h3>No Document Selected</h3>
        <p>Select a document from the sidebar to start editing.</p>
      </div>
    );
  }

  return (
    <div className="document-editor">
      <div className="editor-header">
        <h2>{document.title}</h2>
        <div className="editor-status">
          <span
            className={`status-indicator ${
              isConnected ? "status-connected" : "status-disconnected"
            }`}
          ></span>
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="text-editor"
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelectionChange}
        disabled={!isConnected}
        placeholder={
          isConnected
            ? "Start typing here... Changes are automatically saved and synced with other users."
            : "Connecting to server..."
        }
        rows={20}
      />

      <div className="editor-info">
        <p>
          <small>
            Document ID: {document.id} | Created by: {document.createdBy} | Last
            updated: {new Date(document.updatedAt).toLocaleString()}
          </small>
        </p>
      </div>
    </div>
  );
};

export default DocumentEditor;
