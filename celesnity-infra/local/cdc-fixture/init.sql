CREATE ROLE cdc_reader LOGIN REPLICATION PASSWORD 'cdc_fixture_reader_password';

CREATE TABLE public.orders (
  id integer PRIMARY KEY,
  customer_name text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders OWNER TO cdc_reader;
GRANT CONNECT ON DATABASE cdc_fixture TO cdc_reader;
GRANT USAGE ON SCHEMA public TO cdc_reader;
GRANT SELECT ON TABLE public.orders TO cdc_reader;

CREATE PUBLICATION celesnity_fixture_publication FOR TABLE public.orders;
SELECT pg_create_logical_replication_slot('celesnity_fixture_slot', 'pgoutput');

INSERT INTO public.orders (id, customer_name, amount)
VALUES (1, 'CDC fixture', 10.00);
