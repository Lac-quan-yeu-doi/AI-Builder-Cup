# Signing in and finding your way

Celesnity is a data workspace: you connect data sources, build pipelines, ask an AI assistant questions, and build charts and dashboards, all in one place. This page gets you into the app and shows you where everything lives.

## 1. Signing in

1. Open the address your administrator gave you. You will see **Sign in to Celesnity**.
2. Sign in with the work account provided by your organization.
3. If your organization requires two-factor authentication (MFA), also enter the code from the authenticator app on your phone.
4. After signing in, the app takes you to the first screen you are allowed to see, usually **Home**.

> If the link you opened required a sign-in, you are returned to that exact page once you are in.

> **Local development:** when the app runs in local development mode there is no sign-in page. Opening any link signs you in as the organization owner and takes you straight to that page.

## 2. The layout

| Area | Where | What it is for |
| --- | --- | --- |
| Left sidebar | Left column | Moving between modules. **Collapse sidebar** folds it away. |
| Main area | Centre | The module you have open. |
| Account menu | Bottom left (the initial of your name) | **Change password**, **Sign out**. |
| Language toggle | Next to the account menu: **EN / VI** | Switches the interface language instantly, no reload. |

The sidebar contains the retained workspace destinations:

- **Home**: ask the AI assistant (see *Asking the assistant*).
- **Data**: Databases, Streaming, Plant model, Analytics.

Administration, Documents, Guide, Scripts, Data workflows, and Plugins are not part of this workspace. Their old direct links are unavailable. Query and Skills are also paused.

## 3. Where to start

It depends on your role:

- **Business users and analysts**: go to **Home**, pick the data scope in the "Asking about" box, then ask in plain language. The assistant looks up tables, runs queries and draws charts for you.
- **Data engineers**: go to **Databases** to create a database, connect a source, scan its metadata and build a pipeline.

## 4. Changing your password and signing out

1. Open the **account menu** in the bottom-left corner.
2. Choose **Change password**: enter your current password, the new one, and your MFA code if you have one. You are signed out afterwards and sign in again with the new password.
3. Choose **Sign out** to leave.

## 5. When a page says "Feature not available"

The message *"Your access groups do not include this workspace feature."* means your group has not been given that module. You did nothing wrong; ask your organization administrator to add you to the right group (see *Roles and access*).

## 6. Small tips

- Every list screen has a filter or search box at the top; a few characters are enough.
- Delete and Archive actions always ask for confirmation first.
- If a screen looks stale or is missing data, reload the page; the app resynchronises with the server.
