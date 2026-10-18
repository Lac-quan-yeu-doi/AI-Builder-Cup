# Databases and the catalog

The **Databases** module (under *Data*) is where you create databases in the platform catalog, connect external data sources, scan their structure and build pipelines that load data in. Everything about a database lives on that database's own screen.

## 1. The database list

Open **Databases**. The page lists existing databases with their descriptions; **Filter databases** narrows the list.

Every organization also sees three read-only sample databases: `demo` (customers and orders), `demo1_home_appliance` (Demo Data 1, a chest-freezer plant) and `demo2_coffee_capsules` (Demo Data 2, a coffee-capsule plant). You can open, preview and query them straight away, without connecting a source or running a pipeline. All of them are mock data.

**Creating a database**
1. Click **Create database**.
2. Choose the **Catalog** the database belongs to.
3. Enter a **Database name**: letters, numbers and underscores only, for example `curated_sales`.
4. Add an optional **Description** and save.
5. Click the database name to open it.

You can change the description later with **Edit description**.

## 2. A database's screen

Two buttons sit at the top: **Ask AI** opens the assistant already scoped to this database, and **Open in SQL** opens the Query page with this database selected. Below are the tabs:

| Tab | Content |
| --- | --- |
| **Overview** | A *Step 1 of 3* card walks you through Connect a source → Build a pipeline → Run the pipeline, with the overall health ("Everything is up to date") and *Recent activity*. |
| **Tables** | The tables in the database. Select one to see **Columns**, **Write history** and a **Row preview** (a server-limited sample). |
| **Sources** | Connections to source systems (PostgreSQL, MySQL, …). |
| **Pipelines** | The pipelines that load data from sources into this database. |
| **Runs** | The pipeline run history. |

## 3. Connecting a source

1. Open the **Sources** tab and click **New connection**.
2. In *Register a data connection*, enter a **Service name** (a memorable label) and choose the **Database connector** (the kind of source system).
3. Fill in that connector's fields: host, port, database name, username, password.
4. Click **Test connection**. Only **Save service** once the test succeeds.
5. The source appears in the list. Each row's **More actions** menu offers **Test connection**, **Edit** and **Archive** (with confirmation).

> Passwords are stored securely on the server and never shown again. To change one, click **Edit** and enter the new password.

## 4. Scanning the source's structure (Metadata scan)

After connecting, click the source to open its detail page with three tabs: **Connection**, **Metadata scan**, **Discovered tables**.

1. On **Connection**, click **Test connection** once more; the platform requires a tested connection before a scan can be assigned.
2. On **Metadata scan**, click **Assign a scan**. Enter a **Crawler name**, the **Daily time** it should run and the **Timezone**, then **Assign crawler**.
3. Click **Scan now** to run immediately instead of waiting for the scheduled time.
4. **More scan actions** offers **Pause**, **Resume**, **Edit schedule** and **Remove scan**. **Scan history** lists every scan and its outcome.
5. Once a scan has finished, **Discovered tables** shows the tree *Schemas and databases* → *Tables and views*. Select a table to see its Columns, Constraints, DDL and Properties.

## 5. Building and running a pipeline

1. Open the **Pipelines** tab and click **New pipeline**. Choose the target **Data Catalog database** and enter a **Pipeline name**.
2. The canvas opens. The **node catalogue** on the left (with *Search nodes*) holds source, transform and target nodes: drag them onto the canvas and connect them. Click a node to edit its properties on the right; **Preview data** shows the data flowing through it.
3. Switch to the **script** view to read the generated PySpark (read-only).
4. Click **Validate** to check for problems and **Save** to store the pipeline. Saving is required before **Run**.
5. If someone else changed the same pipeline meanwhile, a conflict dialog asks whether to **Keep editing** (your version) or **Reload saved version**.

The pipeline list offers **Duplicate** and **Archive**; a pipeline not filed under any database shows **File under {database}** to put it in place.

## 6. Watching runs

The **Runs** tab lists every run, filtered by **All / Succeeded / Failed**. Click a run for its **Overview** and **Logs**. A running pipeline can be **Cancel**led; a finished one can be re-run with **Rerun version**, which uses exactly that version of the pipeline.

## 7. Suggested first-time flow

1. Create database → name it → open it.
2. Sources → New connection → Test connection → Save.
3. Open the source → Test connection → Metadata scan → Assign a scan → Scan now.
4. Discovered tables: confirm the expected tables are there.
5. Pipelines → New pipeline → build → Validate → Save → Run.
6. Runs: wait for Succeeded → Tables: check the data arrived.

The guided tutorial **"Create a database and discover source schema"** under the **Tutorials** button walks through exactly this flow.
