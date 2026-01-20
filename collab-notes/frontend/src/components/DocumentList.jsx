import React from "react";

const DocumentList = ({ documents, currentDocument, onSelect, onCreate }) => {
  return (
    <div className="document-list">
      <div className="document-list-header">
        <h3>Documents</h3>
        <button className="btn btn-primary" onClick={onCreate}>
          + New Document
        </button>
      </div>
      <div className="document-items">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`document-item ${
              currentDocument?.id === doc.id ? "active" : ""
            }`}
            onClick={() => onSelect(doc)}
          >
            <div className="document-title">{doc.title}</div>
            <div className="document-meta">
              <span>By: {doc.createdBy}</span>
              <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentList;
