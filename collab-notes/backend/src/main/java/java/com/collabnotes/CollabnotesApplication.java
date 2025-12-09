package com.collabnotes;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CollabnotesApplication {

	private static final Logger log = LoggerFactory.getLogger(CollabNotesApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(CollabnotesApplication.class, args);
		log.info("Collaborative Notes Backend started successfully!");
		log.info("REST API available at: http://localhost:8080/api");
		log.info("WebSocket endpoint available at: ws://localhost:8080/ws");
		log.info("PostgreSQL connected to: localhost:5432/collabnotes");
		log.info("MongoDB connected to: localhost:27017/collabnotes");
		log.info("Zookeeper connected to: localhost:2181");
	}
}