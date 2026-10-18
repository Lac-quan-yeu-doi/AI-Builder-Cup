# Roles and access

What you can see and do in Celesnity depends on two things: your account's **role** in the organization, and the **access groups** you belong to. This page explains both, so you know why a module is missing and what to ask for when you need more.

## 1. Roles in the organization

Every account has exactly one role, set by your organization outside the workspace:

| Role | What it can do |
| --- | --- |
| **Organization owner** | Full workspace access allowed by the deployment policy. |
| **Organization admin** | Broad workspace access allowed by the deployment policy. |
| **Data engineer** | Read and write in the workspace: connect sources, build pipelines, run queries, create charts. |
| **Analyst** | Read and write in the workspace, like a data engineer. |
| **Viewer** | Read only: view data, charts and dashboards; cannot save or change anything. |
| **Auditor** | Read-only access allowed by the deployment policy. |

The workspace no longer includes an Administration screen. Contact the person who manages your deployment when a role needs to change.

## 2. Access groups and visible modules

Your organization can assign **access groups** and choose the **visible workspace features** for each group. You can belong to several groups; you see the union of what all your groups allow.

Modules that can be switched per group:

- Home (assistant)
- Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions
- Streaming, Devices
- Plant model
- Query
- Analytics
- Automations

When you open a page your groups do not include, the app shows **"Feature not available"** rather than a blank screen.

## 3. Data permissions (Catalog access)

Beyond modules, your organization can limit **which data** you may read: by catalog, schema or individual table. These rules apply to you and to the AI assistant when it works on your behalf. If the assistant says it **could not read** a table ("access denied"), you or the assistant most likely lack a grant on that table.

## 4. Asking for more access

Send your workspace support contact three things:

1. The module you need (for example *Analytics*).
2. What you need to do there (view or edit).
3. The data you need to read (catalog, schema or table).

They can add you to the right group or create a new data grant. The change takes effect on your next page load.

## 5. Account security

- Do not share accounts. One person, one account, so the audit log records who did what.
- If your organization requires MFA you need an authenticator app; if you lose your phone, ask an administrator for a reset.
- Change your password at any time from the account menu.
