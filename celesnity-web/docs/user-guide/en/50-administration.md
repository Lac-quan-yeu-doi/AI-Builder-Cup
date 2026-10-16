# Organization and access administration

The **Administration** module (at the bottom of the sidebar) is where organization owners and admins manage members, access groups, data permissions and the AI assistants. Other roles see only the **Overview** tab with a read-only note.

## 1. Overview

Organization details and the current session. **Enable MFA** turns on two-factor authentication **for every member**; the app asks _"Require MFA for everyone?"_ because it cannot be switched off from here afterwards. Warn people to install an authenticator app first.

## 2. Members: inviting and managing people

**Inviting a member**

1. Click **Invite member**.
2. Enter the **email** and choose a **role** (see _Roles and access_).
3. The app produces an **account setup link**, shown **once**; copy it and send it to the person. The link expires after **72 hours**; invite again if it lapses.

**Managing**

- Change a member's **role** or **status** (active / suspended) directly on their row.
- **Remove account permanently** deletes the account, with confirmation. The audit log keeps that person's past actions.

## 3. Groups: who sees which module

Groups decide **which modules a person can see**.

1. Click **Create group**, name and describe it.
2. Select the group and use **Add to group** to add members; **Remove from group** to take them out.
3. Under **Visible workspace features**, tick the modules the group may see (Home, Databases, Tables, Connections, Source schema, Crawler, Pipelines, Executions, Streaming, Devices, Plant model, Query, Analytics, Automations, Documents, Guide, Administration).
4. Click **Save feature visibility**.

A group that has never been saved shows **Unrestricted until saved**: it temporarily sees everything. Save right after creating it to avoid over-granting.

A person in several groups sees the **union** of those groups.

## 4. Catalog access: data permissions

This tab limits which data a member, a group, an assistant or a service identity may read.

**Creating a grant**

1. Choose the **Principal type**: member, group, agent or service identity, then the specific one.
2. Choose the **Resource type** and enter the **Resource name** as `catalog`, `catalog.schema` or `catalog.schema.table`.
3. Choose the **Permissions** (read, for example) and the **Effect** (allow or deny).
4. Tick **Include descendant resources** when the grant covers everything inside (every schema of a catalog, every table of a schema).
5. Click **Create grant**. Remove one with **Delete** on its row.

A **deny** wins over an **allow** when they overlap. Assistants need grants too: if a person may read a table but the assistant may not, the assistant reports _access denied_ when acting for them.

### Service identities

Organization owners and admins can choose **Service identity** under **Principal type** in **Catalog access**. Select **Background executor** for pipelines and background jobs, or **Agent service identity** for the assistant service. Each option shows whether it is enabled. Choose a resource and only the permissions needed, then select **Create grant**. Existing service grants remain visible and can be removed with **Delete**.

These catalog grants do not enable disabled services or change their workspace permissions. Named agents still have their own grant controls and delegated access remains subject to the requesting user's permissions. Service identities stay separate from people in **Members**.

Run details show **Runs as** when supplied by Core. A source-access denial includes **Manage catalog access (organization admins)**. For the background executor, grant access to the relevant source and destination; `DESCRIBE` permits source-schema inspection but does not by itself guarantee the pipeline will succeed. Rerun after correcting the required access.

## 5. Agents: managing the AI assistants

The **Agent management** tab lists the organization's assistants.

- **New agent** creates one. The configuration is written as **YAML** in the editor: name, description, system instructions, allowed tools.
- **Auto-approved actions**: actions the assistant may take without a person approving. Add these only when truly needed.
- **Validate** checks the configuration; **Save manifest** stores it. **Copy YAML** copies it for backup or reuse. **Delete** removes the assistant.

The default assistant (_chat-assistant_) is preconfigured; change it only when you understand the consequences.

## 6. Suggested flow at handover

1. Overview: check the organization details, consider **Enable MFA**.
2. Groups: create groups per department and save **feature visibility** for each.
3. Members: invite people with the right role and add them to groups.
4. Catalog access: grant data access to groups and to the assistants.
5. Verify by signing in as a Viewer and checking that exactly the expected screens appear.

## 7. Audit log

Every change here (invitations, role changes, grants, assistant edits) is written to the audit log with who did it and when. The **Auditor** role can read this log without any editing rights.
