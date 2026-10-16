CREATE SCHEMA reporting;
CREATE SCHEMA restricted;

CREATE TABLE reporting.customers (
  id integer PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  CONSTRAINT customers_email_check CHECK (position('@' in email) > 1)
);

CREATE TABLE reporting.orders (
  id integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES reporting.customers(id),
  total numeric(12, 2) NOT NULL,
  CONSTRAINT orders_total_check CHECK (total >= 0)
);

CREATE VIEW reporting.order_totals AS
SELECT customer_id, sum(total) AS total
FROM reporting.orders
GROUP BY customer_id;

COMMENT ON TABLE reporting.orders IS 'Metadata crawler integration fixture';
COMMENT ON COLUMN reporting.orders.total IS 'Order amount';

CREATE TABLE restricted.hidden_table (id integer PRIMARY KEY);
REVOKE ALL ON SCHEMA restricted FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA restricted FROM PUBLIC;
