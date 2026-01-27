package com.collabnotes.document;

import com.collabnotes.metadata.MetadataService;
import com.collabnotes.zookeeper.ZookeeperService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class DocumentService {

    @Autowired
    private OperationsRepository operationsRepository;

    @Autowired
    private MetadataService metadataService;

    @Autowired
    private OperationTransformer transformer;

    @Autowired
    private ZookeeperService zookeeperService;

    public Operation processOperation(Operation incomingOp) {
        System.out.println("Document Service: Processing operation for document: " +
                incomingOp.getDocumentId());

        try {
            // Mark as applied and set version
            incomingOp.setApplied(true);
            
            // Get all operations to determine version
            List<Operation> existingOps = operationsRepository.findByDocumentIdOrderByTimestampAsc(
                    incomingOp.getDocumentId()
            );
            incomingOp.setVersion(existingOps.size() + 1);
            
            System.out.println("Saving operation: " + incomingOp.getType() + 
                    " at position: " + incomingOp.getPosition() + 
                    " text: '" + incomingOp.getText() + "'");

            // Save to MongoDB (no transformation - use original position)
            Operation savedOp = operationsRepository.save(incomingOp);
            System.out.println("Saved operation to MongoDB with ID: " + savedOp.getId());

            // Update document timestamp in PostgreSQL
            metadataService.updateDocumentTimestamp(incomingOp.getDocumentId());

            // Transfer through Zookeeper
            zookeeperService.transferOperation(savedOp);

            return savedOp;

        } catch (Exception e) {
            System.err.println("Error processing operation: " + e.getMessage());
            throw new RuntimeException("Failed to process operation: " + e.getMessage(), e);
        }
    }

    public List<Operation> getAllAppliedOperations(String documentId) {
        System.out.println("Getting all applied operations for document: " + documentId);
        List<Operation> ops = operationsRepository.findByDocumentIdAndAppliedTrueOrderByTimestampAsc(documentId);
        System.out.println("Found " + ops.size() + " applied operations");
        return ops;
    }

    public String getDocumentContent(String documentId) {
        List<Operation> appliedOps = getAllAppliedOperations(documentId);
        StringBuilder content = new StringBuilder();

        for (Operation op : appliedOps) {
            applyOperationToContent(content, op);
        }

        return content.toString();
    }

    public List<Operation> getOperationsForInitialization(String documentId) {
        System.out.println("Getting operations for initialization of document: " + documentId);
        List<Operation> allOps = operationsRepository.findByDocumentIdOrderByTimestampAsc(documentId);

        // Simulate hash range querying
        if (allOps.size() > 100) {
            System.out.println("Querying by hash ranges (simulated)");
            return queryByHashRanges(documentId, allOps);
        }

        return allOps;
    }

    private List<Operation> getConcurrentOperations(String documentId, long timestamp) {
        // Get operations within ±10 seconds window
        long windowStart = timestamp - 10000;
        List<Operation> recentOps = operationsRepository.findOperationsAfterTimestamp(documentId, windowStart);

        // Filter to get truly concurrent operations (simplified)
        List<Operation> concurrentOps = new ArrayList<>();
        for (Operation op : recentOps) {
            // Consider ops within ±5 seconds as concurrent for demo
            if (Math.abs(op.getTimestamp() - timestamp) <= 5000) {
                concurrentOps.add(op);
            }
        }

        return concurrentOps;
    }

    private void applyOperationToContent(StringBuilder content, Operation op) {
        if (!op.isApplied()) return;

        if ("INSERT".equals(op.getType())) {
            if (op.getPosition() <= content.length()) {
                content.insert(op.getPosition(), op.getText());
            } else {
                content.append(op.getText());
            }
        } else if ("DELETE".equals(op.getType())) {
            if (op.getPosition() < content.length()) {
                int endPos = Math.min(
                        op.getPosition() + op.getText().length(),
                        content.length()
                );
                content.delete(op.getPosition(), endPos);
            }
        }
    }

    private List<Operation> queryByHashRanges(String documentId, List<Operation> allOps) {
        // Simulate hash-based range queries
        List<Operation> result = new ArrayList<>();
        int rangeSize = 50; // Operations per range

        System.out.println("Simulating hash range queries for " + allOps.size() + " operations");

        for (int i = 0; i < allOps.size(); i += rangeSize) {
            int end = Math.min(i + rangeSize, allOps.size());
            List<Operation> rangeOps = allOps.subList(i, end);
            result.addAll(rangeOps);

            System.out.println("Queried hash range " + i + "-" + (end-1) +
                    " (" + rangeOps.size() + " operations)");
        }

        return result;
    }
}