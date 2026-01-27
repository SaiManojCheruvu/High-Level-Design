package com.collabnotes.zookeeper;

import com.collabnotes.document.Operation;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.curator.framework.CuratorFramework;
import org.apache.zookeeper.CreateMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ZookeeperService {

    @Autowired
    private CuratorFramework curatorFramework;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final String OPERATIONS_PATH = "/collab/operations";

    public void transferOperation(Operation operation) {
        try {
            System.out.println("Zookeeper: Transferring operation for document: " +
                    operation.getDocumentId());

            // Create base paths if they don't exist
            createPathIfNotExists(OPERATIONS_PATH);

            // Create document-specific path
            String documentPath = OPERATIONS_PATH + "/" + operation.getDocumentId();
            createPathIfNotExists(documentPath);

            // Store operation as sequential node
            String operationData = objectMapper.writeValueAsString(operation);
            String operationPath = documentPath + "/op-";

            String createdPath = curatorFramework.create()
                    .withMode(CreateMode.PERSISTENT_SEQUENTIAL)
                    .forPath(operationPath, operationData.getBytes());

            System.out.println("Zookeeper: Created operation node at: " + createdPath);

        } catch (Exception e) {
            System.err.println("Zookeeper: Failed to transfer operation: " + e.getMessage());
        }
    }

    public void registerDocumentNode(String documentId, String nodeId) {
        try {
            String nodesPath = "/collab/nodes/" + documentId;
            createPathIfNotExists(nodesPath);

            String nodePath = nodesPath + "/" + nodeId;
            curatorFramework.create()
                    .withMode(CreateMode.EPHEMERAL)
                    .forPath(nodePath, "connected".getBytes());

            System.out.println("Zookeeper: Registered node " + nodeId + " for document " + documentId);

        } catch (Exception e) {
            System.err.println("Zookeeper: Failed to register node: " + e.getMessage());
        }
    }

    private void createPathIfNotExists(String path) throws Exception {
        if (curatorFramework.checkExists().forPath(path) == null) {
            curatorFramework.create().creatingParentsIfNeeded().forPath(path);
        }
    }
}