import React, { useState, useEffect } from "react";

const OperationHistory = ({ operations }) => {
  const [visibleOperations, setVisibleOperations] = useState([]);

  useEffect(() => {
    // Show last 20 operations
    setVisibleOperations(operations.slice(-20).reverse());
  }, [operations]);

  const getOperationIcon = (type) => {
    switch (type) {
      case "INSERT":
        return "📝";
      case "DELETE":
        return "🗑️";
      default:
        return "🔧";
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (operations.length === 0) {
    return (
      <div className="operation-history">
        <h3>Operation History</h3>
        <div className="empty-state">
          <p>No operations yet. Start typing to see history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="operation-history">
      <h3>Recent Operations ({operations.length})</h3>
      <div className="operation-items">
        {visibleOperations.map((op, index) => (
          <div key={index} className="operation-item">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span
                  className={`operation-type operation-${op.type.toLowerCase()}`}
                >
                  {getOperationIcon(op.type)} {op.type}
                </span>
                <strong>{op.userId}:</strong> "
                {op.text && op.text.length > 30
                  ? `${op.text.substring(0, 30)}...`
                  : op.text || "[no text]"}
                " at position {op.position}
              </div>
              <small style={{ color: "#6c757d" }}>
                {formatTime(op.timestamp)}
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OperationHistory;
