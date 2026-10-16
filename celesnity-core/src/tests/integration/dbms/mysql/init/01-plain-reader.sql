-- Fixture-only legacy account: mysql2 must authenticate without TLS or server
-- public-key retrieval to prove the probe's plaintext fallback behavior.
ALTER USER 'celesnity_reader'@'%'
    IDENTIFIED WITH mysql_native_password BY 'mysql-test-only';
