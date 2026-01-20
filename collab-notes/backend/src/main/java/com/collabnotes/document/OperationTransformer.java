package com.collabnotes.document;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.collabnotes.metadata.MetadataService;
import java.util.List;

@Component
public class OperationTransformer {
    private static final Logger log = LoggerFactory.getLogger(OperationTransformer.class);
    public Operation transform(Operation incoming, List<Operation> concurrentOps) {
        Operation transformed = new Operation();
        transformed.setDocumentId(incoming.getDocumentId());
        transformed.setUserId(incoming.getUserId());
        transformed.setType(incoming.getType());
        transformed.setText(incoming.getText());
        transformed.setTimestamp(System.currentTimeMillis());

        int position = incoming.getPosition();
        for (Operation existing : concurrentOps) {
            if (existing.getTimestamp() < incoming.getTimestamp()) {
                position = adjustPosition(position, existing);
            }
        }
        transformed.setPosition(position);
        transformed.setVersion(getNextVersion(concurrentOps));
        transformed.setApplied(true);
        log.info("Transformed operation: {}, from position: {}, to position: {}", incoming.getType(), incoming.getPosition(), position);
        return transformed;
    }

    private int adjustPosition(int position, Operation existing) {
        if ("INSERT".equals(existing.getType())) {
            if (existing.getPosition() <= position) {
                return  position + existing.getText().length();
            }
        } else if ("DELETE".equals(existing.getType())) {
            int deleteEnd = existing.getPosition() + existing.getText().length();
            if (existing.getPosition() < position) {
                if (deleteEnd <= position) {
                    return position -  existing.getText().length();
                } else {
                    return existing.getPosition();
                }
            }
        }
        return position;
    }

    private int getNextVersion(List<Operation> ops) {
        int maxVersion = 0;
        for (Operation op: ops) {
            if (op.getVersion() > maxVersion) {
                maxVersion = op.getVersion();
            }
        }
        return maxVersion + 1;
    }
}
