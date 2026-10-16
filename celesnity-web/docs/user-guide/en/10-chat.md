# Asking the assistant (Home)

**Home** is where you talk to the Celesnity AI assistant. You ask in plain language; the assistant finds the right tables, runs the queries, draws charts and answers with a short commentary. You do not need to know SQL.

## 1. The start screen

With no conversation open, the screen asks **"What can I help you analyze?"** and offers:

- The **question box** in the middle.
- **Suggested**: four quick starts: _Explore my data catalog_, _Help me write a SQL query_, _Build a data pipeline_, _Visualize my data_. Clicking one sends it straight away.
- **Recent**: your latest conversations; click to reopen.

The status line above reads **"Connected to workspace data"** when the assistant is ready. If it says **"Chat service is unavailable"**, wait a moment and reload; if it persists, tell your administrator.

## 2. The question box

| Control                             | Meaning                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Asking about: All databases**     | The data scope. By default the assistant may read every database; pick one database when only that data matters. It is locked while the assistant is answering.                                                                   |
| **Agent**                           | Which assistant answers (shown only when your organization has several). It can be chosen only before the first message; the conversation then stays with that assistant.                                                         |
| The **+** button ("Add to message") | _Attach a file_: attach a PDF to the message (not yet available on the very first message). _Open a workspace panel_: quick access to the right-hand panels: Workspace files, Charts, Automations, Application state, Agent info. |
| Type **/**                          | The list of quick commands, the same four as the suggestions above.                                                                                                                                                               |
| Type **@**                          | Mention a connected plugin (currently _Google Drive_) so the assistant works with the files in it.                                                                                                                                |
| **Enter** or the arrow button       | Send. Shift+Enter inserts a line break.                                                                                                                                                                                           |

Tips for good questions: name the **table or topic**, the **time range**, and the **shape of the result** you want (a number, a table, a chart). For example: _"Monthly revenue for the Ba Ghien restaurant in 2026, as a bar chart, with a two-sentence comment."_

## 3. Reading an answer

An answer usually has these parts, top to bottom:

1. **View reasoning · N steps**: click to see what the assistant did (listing tables, running a query, drawing a chart). Each step is named in plain words.
2. **Charts, tables or documents** the assistant produced, drawn right inside the conversation (see _Charts, tables and documents in chat_).
3. The **opening sentence** ("I will list the tables and then total the revenue…") and the **answer** in the next paragraph.
4. **Sources (N)**: what the answer is based on, when applicable.
5. **Ask more about this**: a few suggested follow-up questions; click one to send it.
6. The **action row**: _Copy answer_, _Regenerate answer_ (answers the same question again; newest answer only), _View run details_ (the technical record of the run). Share, Good answer and Poor answer arrive in a later release.

While the assistant is still working, a **"Thinking…"** card under the text already on screen shows the step in progress and how many seconds it has taken. When the card disappears and the action row appears, the answer is complete.

## 4. When the assistant asks back or asks permission

- **Clarifying question**: the assistant shows a question with a few options. Click one, or type your own answer in the box (its placeholder changes to _"Answer to carry on"_).
- **Permission to act** ("Waiting for you"): the assistant describes the action, its input and output, and its reasoning. Click **Approve** to allow it or **Reject** to stop it. Read carefully when an action is marked _cannot be undone_.
- **System approval** ("Waiting for your approval"): the same idea, with **Approve / Deny**. An expired request says _"Approval request expired"_; ask again and the assistant creates a new one.

## 5. Conversations and the side panel

- **Conversations** (top left of the chat area): **New conversation**, search, and reopening older ones. Every conversation has its own address, which you can send to a colleague who has access.
- **Show conversation timeline**: a timeline of turns, handy in a long conversation.
- **The side panel (stage)**: where charts, tables, documents, assistant info and run logs open. Each item is a tab; the tab's **More** menu offers _Split right_, _Split down_, _Maximize_, _Close other tabs_, _Close pane_. **Hide the stage / Show the stage** toggles the whole panel.
- When you reopen an old conversation, earlier charts are still inside their answers; use the open button to bring one onto the side panel.

Each browser tab keeps its own conversation and update cursor. Closing a tab releases its connection while the assistant’s run continues. An idle conversation pauses updates after the next four-minute connection rotation; returning to the tab or sending a new message restores current state and missed results first. If replay is unavailable, the same conversation reloads automatically without resending earlier questions. Active runs and pending questions or approvals keep receiving updates. After repeated recovery failures, use **Retry**; an expired sign-in returns you to the login page.

## 6. Common problems

| You see                                                                            | It means                                                     | What to do                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| _That run failed._                                                                 | The reply hit an error.                                      | Click **Try again**.                                                                                  |
| _Connection lost_                                                                  | The connection to the server dropped mid-answer.             | Click **Retry**; the answer in progress resumes.                                                      |
| Sending reports an error, but the message appears after reopening the conversation | The request may have completed before the connection failed. | Reopen the conversation and check its latest message before sending again, to avoid a duplicate turn. |
| The assistant reports _access denied_ on a table                                   | You or the assistant lack read access to that table.         | Request access as described in _Roles and access_.                                                    |
| The answer uses the wrong table or is too broad                                    | The scope is "All databases".                                | Pick the right database under _Asking about_ and ask again.                                           |

Assistant updates can continue beyond 30 seconds on one connection. A long response may still briefly show **Reconnecting…** when its connection ends; the same run resumes from its last received update. You do not need to send the prompt again.
