package java.com.collabnotes.document;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.List;

public interface OperationsRepository extends MongoRepository<Operation, String> {
    List<Operation> findByDocumentIdOrderByTimestampAsc(String documentId);
    List<Operation> findByDocumentIdAndAppliedTrueOrderByTimestampAsc(String documentId);
    @Query("{ 'documentId': ?0, 'timestamp': { $gte: ?1 } }")
    List<Operation> findOperationsAfterTimestamp(String documentId, long timestamp);
    @Query(value = "{ 'documentId': ?0", sort = "{ 'version': -1 }", fields = "{'version': 1 }")
    List<Operation> findLatestVersion(String documentId);

}
