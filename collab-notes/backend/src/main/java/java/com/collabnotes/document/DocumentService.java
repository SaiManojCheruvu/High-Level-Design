package java.com.collabnotes.document;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.com.collabnotes.metadata.MetadataService;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class DocumentService {
    private static final Logger log = LoggerFactory.getLogger(OperationTransformer.class);
    @Autowired
    private OperationsRepository operationsRepository;

    @Autowired
    private MetadataService metadataService;

    @Autowired
    private OperationTransformer transformer;

    @Autowired
    private ZooKeeperService zooKeeperService;

    public Operation processOperation(Operation incomingOp) {
        log.info("Document Service: Processing operation for document: {}", incomingOp.getDocumentId());
        try {
            List<Operation> concurrentOps = getConcurrentOperations(incomingOp.getDocumentId(), incomingOp.getTimestamp());
            log.info("Found: {}, concurrent operations", concurrentOps.size());
            Operation transformedOp = transformer.transform(incomingOp, concurrentOps);
            Operation savedOp = operationsRepository.save(transformedOp);
            log.info("Saved Operation to Mongo with ID: {}", savedOp.getId());
            metadataService.updateDocumentTimestamp(incomingOp.getDocumentId());
            zooKeeperService.transferOperation(transformedOp);
            return transformedOp;
        } catch (Exception e) {
            throw new RuntimeException("Failed to process operation: "+ e.getMessage(), e);
        }
    }

    public List<Operation> getAllAppliedOperations(String documentId) {
        log.info("Getting all applied for document: {}", documentId);
        List<Operation> ops = operationsRepository.findByDocumentIdAndAppliedTrueOrderByTimestampAsc(documentId);
        log.info("Found, {}, applied operations", ops.size());
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
        log.info("Getting operations for initialization of document, {}", documentId);
        List<Operation> allOps = operationsRepository.findByDocumentIdOrderByTimestampAsc(documentId);
        if (allOps.size() > 100) {
            log.info("Querying by hash ranges (simulated)");
            return queryByHashRanges(documentId, allOps);
        }
        return allOps;

    }

    private List<Operation> getConcurrentOperations(String documentId, long timestamp) {
        long windowStart= timestamp - 100000;
        List<Operation> recentOps = operationsRepository.findOperationsAfterTimestamp(documentId, windowStart);
        List<Operation> concurrentOps = new ArrayList<>();
        for (Operation op : recentOps) {
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
                int endPos = Math.min(op.getPosition() + op.getText().length(), content.length());
                content.delete(op.getPosition(), endPos);
            }
        }
    }

    private List<Operation> queryByHashRanges(String documentId, List<Operation> allOps) {
        List<Operation> result = new ArrayList<>();
        int rangeSize = 50;
        log.info("Simulating hash range queries for {} operations", allOps.size());
        for (int i = 0; i < allOps.size(); i+= rangeSize) {
            int end = Math.min(i + rangeSize, allOps.size());
            List<Operation> rangeOps = allOps.subList(i, end);
            result.addAll(rangeOps);
            log.info("Queried hash range {} - {} ({} operations)", i, end - 1, rangeOps.size());
        }
        return result;
    }

}
