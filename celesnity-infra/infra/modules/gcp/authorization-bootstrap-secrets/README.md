# Core organization bootstrap inputs

Terraform creates six regionally replicated, environment-specific Secret Manager containers and grants
the configured Core Cloud Build service account secret-level read access. It
also grants that account access to the existing Identity Platform tenant-ID
secret. Terraform does **not** create bootstrap versions: putting the approved
first-owner subject or email in `.tfvars` would copy it into Terraform state.

Before a first Core deployment, an authorized identity administrator must
approve the target organization and add versions to the four organization
containers. The owner-subject and owner-email containers need versions only if
the selected organization has no active owner. Add both together through the
Secret Manager console or an approved, audited secret-delivery workflow. Do
not put values in Git, a shell history, build substitutions, or Terraform
variables. For a new owner, verify that the subject is the immutable UID in
the same Identity Platform tenant as the existing tenant-ID secret. The Core
migration/bootstrap Job rejects missing and conflicting identifiers; it does
not create Identity Platform users or replace existing owners.

The Core build trigger's actual service account must match
`core_build_service_account_email` in its environment Terraform configuration.
Changing a trigger identity without updating Terraform causes a safe build
failure. A separate migration is needed to revoke any older project-wide
Secret Manager Accessor grant after every application build has scoped grants.
