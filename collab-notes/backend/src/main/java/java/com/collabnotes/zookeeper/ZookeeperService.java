package java.com.collabnotes.zookeeper;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.curator.framework.CuratorFramework;
import org.apache.zookeeper.CreateMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.com.collabnotes.document.Operation;
import java.com.collabnotes.metadata.MetadataService;

@Service
public class ZookeeperService {
    private static final Logger log = LoggerFactory.getLogger(MetadataService.class);
    @Autowired
    private CuratorFramework curatorFramework;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final String OPERATIONS_PATH = "/collab/operations";

    public void transferOperations(Operation operation) {
        try {
            log.info("Zookeeper: Transferring operation for document: {}", operation.getDocumentId());
            createPathIfNotExists(OPERATIONS_PATH);
            String documentPath = OPERATIONS_PATH + "/" + operation.getDocumentId();
            createPathIfNotExists(documentPath);

            String operationData = objectMapper.writeValueAsString(operation);
            String operationPath = documentPath + "/op-";
            String createdPath = curatorFramework.create().withMode(CreateMode.PERSISTENT_SEQUENTIAL).forPath(operationPath, operationData.getBytes());
            log.info("Zookeeper: created operation node at: {}", createdPath);
        } catch (Exception e) {
            log.error("Zookeeper: Failed to transfer operation: {}", e.getMessage());
        }
    }

    public void registerDocumentNode(String documentId, String nodeId) {
        try {
            String nodesPath = "/collab/nodes/" + documentId;
            createPathIfNotExists(nodesPath);

            String nodePath = nodesPath + "/" + nodeId;
            curatorFramework.create().withMode(CreateMode.EPHEMERAL).forPath(nodePath, "conected".getBytes());
            log.info("Zookeeper: Registered node: {}, for document {}", nodeId, documentId);
        } catch (Exception e) {
            log.error("Zookeeper: Failed to register node: {}", e.getMessage());
        }
    }

    private void createPathIfNotExists(String path) throws Exception {
        if (curatorFramework.checkExists().forPath(path) == null) {
            curatorFramework.create().creatingParentsIfNeeded().forPath(path);
        }
    }
}
