import React from "react";

const ConnectionStatus = ({ isConnected, isConnecting }) => {
  const getStatusText = () => {
    if (isConnecting) return "Connecting...";
    return isConnected ? "Connected" : "Disconnected";
  };

  const getStatusClass = () => {
    if (isConnecting) return "status-connecting";
    return isConnected ? "status-connected" : "status-disconnected";
  };

  return (
    <div className="connection-status">
      <div className={`status-indicator ${getStatusClass()}`}></div>
      <span>{getStatusText()}</span>
    </div>
  );
};

export default ConnectionStatus;
