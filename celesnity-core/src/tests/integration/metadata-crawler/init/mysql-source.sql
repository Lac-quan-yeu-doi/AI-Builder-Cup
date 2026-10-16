CREATE TABLE analytics.customers (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  CONSTRAINT customers_email_check CHECK (email LIKE '%@%')
);

CREATE TABLE analytics.orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  total DECIMAL(12, 2) NOT NULL,
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES analytics.customers(id),
  CONSTRAINT orders_total_check CHECK (total >= 0)
);

CREATE VIEW analytics.order_totals AS
SELECT customer_id, SUM(total) AS total
FROM analytics.orders
GROUP BY customer_id;

ALTER TABLE analytics.orders COMMENT = 'Metadata crawler integration fixture';
