package java.com.collabnotes.metadata;

import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.transaction.Transactional;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class MetadataService {
    private static final Logger log = LoggerFactory.getLogger(MetadataService.class);
    @Autowired
    private MetadataRepository metadataRepository;

    @Transactional
    public DocumentMetadata createDocument(String title, String createdBy) {
        DocumentMetadata metadata = new DocumentMetadata();
        metadata.setId("doc-"+ UUID.randomUUID().toString());
        metadata.setTitle(title);
        metadata.setCreatedAt(new Date());
        metadata.setUpdatedAt(new Date());
        log.info("Creating document metadata: {} - '{}' created by {}", metadata.getId(), metadata.getTitle(), createdBy);
        DocumentMetadata saved = metadataRepository.save(metadata);
        log.debug("Document saved successfully: {}", saved.getId());
        return saved;
    }

    public DocumentMetadata getDocument(String id) {
        log.debug("Fetching document metadata for ID: {}", id);
        return metadataRepository.findById(id)
                .orElseThrow(() -> {
                    log.error("Document not found: {}", id);
                    return new RuntimeException("Document not found: "+id);
                });
    }

    public List<DocumentMetadata> getAllDocuments() {
        log.debug("Fetching all documents");
        List<DocumentMetadata> documents = metadataRepository.findAll();
        log.info("Found {} documents", documents.size());
        return  documents;
    }

    @Transactional
    public void updateDocumentTimestamp(String id) {
        try {
            DocumentMetadata metadata = getDocument(id);
            metadata.setUpdatedAt(new Date());
            metadataRepository.save(metadata);
            log.debug("Updated timestamp for document: {}", id);
        } catch (Exception e) {
            log.error("Failed to update timestamp for document {}: {}", id, e.getMessage(), e);
        }
    }
}
