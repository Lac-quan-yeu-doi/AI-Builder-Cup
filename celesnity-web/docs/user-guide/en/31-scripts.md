# Scripts

The **Scripts** module (under *Tools*) is for people who prefer to write PySpark by hand rather than drag a pipeline together. Each script is tied to an active **source connection**, saved as versions, and can be run straight from the app.

## 1. Prerequisite

You need at least **one active source connection** (see *Databases and the catalog → Connecting a source*). Without one, the create button is locked.

## 2. Creating a script

1. Open **Scripts** and click **New script** (or **Create script draft**).
2. Enter a **Script name** and choose the **Active connection** the script reads from.
3. Write a short **Description**: what the script does and where its output goes.
4. Write the code in the Python editor. **Load source** inserts the boilerplate that reads from the chosen connection, so you do not write the connection code yourself.
5. Click **Save** to store a draft, or **Save & Run** to store and run immediately.

## 3. Reading the outcome

After a run, the result and log appear in the panel below. A failing script stops and points at the failing line; fix it and **Save & Run** again.

## 4. Immutable history

Every save creates a version that cannot be changed, so it is always possible to trace which code produced which data. **Immutable history** records:

| Column | Meaning |
| --- | --- |
| **Bucket** / **Object key** | Where the code version is stored in object storage. |
| **SHA-256** | A fingerprint proving the content was not altered. |
| **Published** | When it was saved. |

You can open an old version to read it, but not overwrite it; editing creates a new version.

## 5. Scripts or Pipelines?

- Use **Pipelines** when the flow can be expressed with the standard nodes (read, filter, join, write) and needs to run on a schedule.
- Use **Scripts** for custom logic, extra Python libraries, or a quick experiment with a transformation.

## 6. Notes

- A script runs with the data permissions of the connection it uses.
- Viewers can read scripts and their history but cannot create or run them.
