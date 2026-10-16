# Automations

The **Automations** module (under *Tools*) chains several assistant runs into a **workflow** that runs by itself when an event arrives or on a schedule. For example: every morning at 7, compute yesterday's figures, write the report, save it as a document.

## 1. Creating a workflow

1. Open **Automations** and click **New workflow**.
2. Enter a **Name**.
3. Choose the **Trigger type**:
   - **Event**: runs when an event arrives. Enter the **Event topic**. The **Event topic assistant** lists existing topics; click **Use topic** to pick one.
   - **Schedule**: runs on a timetable. Enter a **Cron expression** (for example `0 7 * * 1-5` is 07:00 on weekdays) and the **Timezone**.
4. Save. A new workflow is disabled until you enable it.

The workflow list offers **Open**, **Rename**, **Duplicate**, **Enable / Disable** and **Remove**.

## 2. Adding steps

Open the workflow and click **Add step** for each step. In the **Step** panel on the right:

| Field | Meaning |
| --- | --- |
| **Agent** | Which assistant performs this step. |
| **Input template** | The request sent to the assistant. It can include trigger data and earlier results through variables such as `{{ trigger.plant }}` or `{{ steps.1.output }}`. |
| **System prompt** | Background instructions for this step (tone, limits, output format). |
| **Remove step** | Deletes the step. |

Steps run **in order**: each step receives the previous step's result.

## 3. Declaring trigger fields

To use event data in a template, declare it under **Trigger fields**: click **Add trigger field**, give it a name and a type, then **Save trigger fields**. A test run then asks for values for exactly these fields.

## 4. Testing

Click **Test fire**. Enter values for the trigger fields and run. The **Force failure at step** option deliberately fails one step so you can see how the workflow behaves. The outcome appears in **Run history**.

## 5. Enabling and monitoring

- **Enable** starts the workflow on its event or schedule; **Disable** pauses it.
- **Run history** lists every run with its status. Click one for **Run details**: each step, its timing and its result.
- Inside Run details:
  - **Retry from step** re-runs from the failed step instead of from the beginning.
  - **Show files** lists the files that step produced.
  - Documents created by the run are listed with **Download PDF**.

## 6. The side panel

The workflow page has two tabs on the right: **Chat** (a workflow assistant: ask about this workflow, have it improve a template) and **Step** (the selected step's properties).

## 7. Suggested flow

New workflow → Add step (one or more) → Add trigger field → Save trigger fields → Test fire → check Run history → Enable.

## 8. Notes

- A workflow runs with the permissions of the chosen assistant; if a step needs an approved action, the run waits until someone approves it in Home.
- Charts produced by a workflow are embedded in that run's document; open the document to see them.
