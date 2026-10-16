# Release 0.4.0 bootstrap retirement

The immutable `20260926100000_retire_unowned_bootstrap_organization` migration
retires the fixed-ID bootstrap organization **only if it remains unclaimed**.
Production has already applied it. Development enrolled that same ID as a real,
owner-bound organization before the migration was introduced; the migration
failed at its guard and Prisma recorded that failed attempt. Do not edit the
original migration or delete the organization to force it through.

Prisma will not execute a later migration while a failed migration remains
unresolved. A SQL migration cannot repair this history by itself. For the
known development failure only, an operator must inspect the failed migration
record, verify its checksum and guard error, verify the organization is active
with a bound identity tenant and active owner, and confirm the failed `DO`
statement made no partial changes. Then, in the Core migrator image and against
the development application schema, run once:

```sh
/app/node_modules/.bin/prisma migrate resolve --applied 20260926100000_retire_unowned_bootstrap_organization
```

The command changes Prisma migration history, not tenant data. Do not run it
for another failure or against production, where the migration is already
complete. The normal Core migration/bootstrap Job can then run
`prisma migrate deploy`. Its forward-only
`20260927100000_verify_legacy_bootstrap_retirement` SQL migration verifies
the fixed-ID organization is either retired or a real active tenant with an
owner. For a claimed organization, it writes an audit record explaining why
the organization was retained. It never activates an unclaimed placeholder or
grants access. An unexpected state fails the rollout closed.

Deploy Core before Agent: Agent's manifest migration depends on Core's
organization-inventory endpoint. Complete the development reconciliation and
verify Core before rolling out Agent. Production requires no history repair;
the same release migration chain is a no-op for its retired placeholder.
