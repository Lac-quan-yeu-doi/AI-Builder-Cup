CREATE TABLE IF NOT EXISTS events (
    event_id BIGINT PRIMARY KEY,
    event_name VARCHAR(64) NOT NULL
);

INSERT INTO events (event_id, event_name)
VALUES (1, 'mysql-spark-smoke')
ON DUPLICATE KEY UPDATE event_name = VALUES(event_name);
