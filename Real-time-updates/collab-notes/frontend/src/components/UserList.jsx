import React, { useState, useEffect } from "react";

const UserList = ({ users, currentUser }) => {
  const [uniqueUsers, setUniqueUsers] = useState([]);

  useEffect(() => {
    // Remove duplicates and ensure current user is included
    const userSet = new Set(users);
    userSet.add(currentUser);
    setUniqueUsers(Array.from(userSet));
  }, [users, currentUser]);

  const getUserColor = (userId) => {
    const colors = [
      "#667eea",
      "#764ba2",
      "#f093fb",
      "#f5576c",
      "#4facfe",
      "#00f2fe",
      "#43e97b",
      "#38f9d7",
      "#fa709a",
      "#fee140",
      "#a8edea",
      "#fed6e3",
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (userId) => {
    if (!userId) return "?";
    return userId.charAt(0).toUpperCase();
  };

  return (
    <div className="user-list">
      <h3>Active Users ({uniqueUsers.length})</h3>
      <div className="user-items">
        {uniqueUsers.map((userId) => (
          <div key={userId} className="user-item">
            <div
              className="user-avatar"
              style={{ background: getUserColor(userId) }}
            >
              {getInitials(userId)}
            </div>
            <span className="user-name">
              {userId === currentUser ? `${userId} (You)` : userId}
            </span>
            {userId === currentUser && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "0.8rem",
                  color: "#28a745",
                }}
              >
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserList;
