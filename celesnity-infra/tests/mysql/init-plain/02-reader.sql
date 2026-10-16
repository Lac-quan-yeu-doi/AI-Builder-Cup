-- Fixture-only legacy account: Connector/J must authenticate without TLS or
-- server public-key retrieval to prove the adapter's sslMode=DISABLED path.
ALTER USER 'celesnity_reader'@'%'
    IDENTIFIED WITH mysql_native_password BY 'mysql-test-only';
