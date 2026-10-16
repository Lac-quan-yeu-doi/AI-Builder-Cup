# Roles and access

What you can see and do in Celesnity depends on two things: your account's **role** in the organization, and the **access groups** you belong to. This page explains both, so you know why a module is missing and what to ask for when you need more.

## 1. Roles in the organization

Every account has exactly one role, set by the administrator at invitation time:

| Role | What it can do |
| --- | --- |
| **Organization owner** | Everything, including inviting members, creating groups, granting data access and managing assistants. |
| **Organization admin** | The same as the owner inside Administration. |
| **Data engineer** | Read and write in the workspace: connect sources, build pipelines, run queries, create charts. |
| **Analyst** | Read and write in the workspace, like a data engineer. |
| **Viewer** | Read only: view data, charts and dashboards; cannot save or change anything. |
| **Auditor** | Sees organization details and audit logs only; no access to working data. |

Inside the app the role shows most clearly in **Administration**: only owners and admins see all its tabs; other roles see the Overview tab with a read-only note.

## 2. Access groups and visible modules

Administrators create **groups** and, for each group, choose the **visible workspace features**. You can belong to several groups; you see the union of what all your groups allow.

Modules that can be switched per group:

- Home (assistant, Skills, Plugins)
- Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions
- Streaming, Devices
- Plant model
- Query
- Analytics
- Automations
- Documents
- Guide
- Administration

A group that has never been configured shows the label **"Unrestricted until saved"** to administrators: it temporarily sees everything until it is saved for the first time.

When you open a page your groups do not include, the app shows **"Feature not available"** rather than a blank screen.

## 3. Data permissions (Catalog access)

Beyond modules, administrators can limit **which data** you may read: by catalog, schema or individual table. These rules apply to you and to the AI assistant when it works on your behalf. If the assistant says it **could not read** a table ("access denied"), you or the assistant most likely lack a grant on that table.

## 4. Asking for more access

Send your administrator three things:

1. The module you need (for example *Analytics*).
2. What you need to do there (view or edit).
3. The data you need to read (catalog, schema or table).

The administrator adds you to the right group or creates a new data grant. The change takes effect on your next page load.

## 5. Account security

- Do not share accounts. One person, one account, so the audit log records who did what.
- If your organization requires MFA you need an authenticator app; if you lose your phone, ask an administrator for a reset.
- Change your password at any time from the account menu.
