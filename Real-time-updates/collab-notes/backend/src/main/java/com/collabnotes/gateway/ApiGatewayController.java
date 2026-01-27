package com.collabnotes.gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.collabnotes.metadata.DocumentMetadata;
import com.collabnotes.metadata.MetadataService;
import java.util.List;

@RestController
@RequestMapping("/docs")
public class ApiGatewayController {
    public static class CreateDocumentRequest {
        private  String title;
        private String createdBy;
        private String createdByName;
        
        public String getTitle() {return  title;}
        public void setTitle(String title) {this.title = title;}

        public String getCreatedBy() {return  this.createdBy;}
        public void setCreatedBy(String createdBy) {this.createdBy = createdBy;}
        
        public String getCreatedByName() {return this.createdByName;}
        public void setCreatedByName(String createdByName) {this.createdByName = createdByName;}
    }

    private static final Logger log = LoggerFactory.getLogger(ApiGatewayController.class);
    @Autowired
    private MetadataService metadataService;

    @PostMapping
    public ResponseEntity<DocumentMetadata> createDocument(@RequestBody CreateDocumentRequest request) {
        log.info("API Gateway: POST /docs - Creating document: {} by {}", request.getTitle(), request.getCreatedByName());
        DocumentMetadata metadata = metadataService.createDocument(
            request.getTitle(), 
            request.getCreatedBy(),
            request.getCreatedByName()
        );
        return ResponseEntity.ok(metadata);

    }

    @GetMapping
    public ResponseEntity<List<DocumentMetadata>> getAllDocuments() {
        log.info("API Gateway: GET /docs - Listing all document");
        List<DocumentMetadata> documents = metadataService.getAllDocuments();
        return ResponseEntity.ok(documents);
    }

    @GetMapping("/{id}")
    public ResponseEntity<DocumentMetadata> getDocument(@PathVariable String id) {
        log.info("API Gateway: SET /docs/ {}",  id);
        DocumentMetadata metadata = metadataService.getDocument(id);
        return  ResponseEntity.ok(metadata);

    }

    @GetMapping("/{id}/content")
    public ResponseEntity<String> getDocumentContent(@PathVariable String id) {
        log.info("API Gateway: GET /docs/{}/content", id);
        try {
            return ResponseEntity.ok("Document content placeholder");
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error: "+ e.getMessage());
        }
    }
}
