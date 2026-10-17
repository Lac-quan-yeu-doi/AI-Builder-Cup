# Plant model

The **Plant model** module (under *Data*) describes your plant as a tree of objects: areas, lines, machines, sensors… with the properties of each type and the process routes between them. Once the model exists, operational data, dashboards and the AI assistant all know what "press number 3 on line A" means.

## 1. Creating a plant

1. Open **Plant model**. The page lists existing plants (sites).
2. Click **Create plant**, enter a **Name** and a **Code** (a short identifier that does not change later), and save.
3. Click the plant to open it. You land on the **Overview** tab.

Each plant has four tabs: **Overview**, **Model**, **Dashboards**, **Configure**. **Ask Minder** opens an assistant specialised in plant models that knows this plant's structure.

### Creating a plant from a walkthrough video

1. On **Plant model**, click **Create from walkthrough**.
2. Drop a phone video of the floor, one to three minutes long. Walk close to each machine and its label.
3. Click **Map this floor**. Gemini takes about half a minute and returns the areas, lines and machines it saw, with the material flow between them.
4. Check the result on the **Twin** tab. Click a machine to see the video frame it was seen in and play the video from that moment. A dashed flow is one Gemini assumed rather than saw. **For an engineer to confirm** lists what the camera missed.
5. Adjust the **Name** and **Code**, then click **Create plant**. The model is saved as a draft that you can edit and publish like any other.

**Try a sample** shows a recorded answer for a public video of a feed pellet line, without uploading anything.

## 2. Defining object types (Node types)

Before adding equipment, define the shared **object types**:

1. On the **Model** tab, open **Node types** and click **Add node type** (for example *Line*, *Press*, *Temperature sensor*).
2. For each type, **Add property** to declare its attributes (capacity, serial number, alarm threshold…). Each property has a data type.
3. A property can be **bound to the Data Catalog** ("Read-only Data Catalog binding"): its value is read from a table column in the catalog instead of typed in, so it stays current.

You can also start from **Templates** if your organization has prepared any.

## 3. Building the object tree

1. Click **New node** to add an object.
2. In the **Inspector** on the right, pick the **Node type**, name the object, choose its **Parent / container** and its **Routing role** (its part in the process route: source, intermediate, target…).
3. Fill in the property values for that type.
4. Repeat until the tree mirrors the plant: area → line → machine → sensor.

Tip: name objects the way people name them on the shop floor; the assistant and dashboards will use those exact names.

### Capturing repair know-how

The **Repairs** tab turns an expert's repair into a guide the next technician can follow.

1. Click **Capture a repair**. Choose the machine, name the fault and the technician, and drop a video of the repair with sound. The technician should talk while they work, say every value out loud, and say why when they do something their own way.
2. Gemini writes the procedure: steps with the seconds where each happens, tools, parts, values and safety steps. Where the technician did something without explaining, it writes the question to ask them.
3. On the **Procedure** tab, confirm every value Gemini heard and every safety step, and type or dictate the expert's answers to the why questions. **Approve and publish** is available once everything is confirmed; it also publishes the guide as an assistant skill.
4. **Guide a repair** walks a technician through the steps. Turn on **Hands-free** to hear each step and answer by voice: "next", "back", "show me", or any question about the step. Safety steps need a photo check or a confirmation before going on.
5. **Know-how transfer** compares guided repairs with the expert's time and shows steps technicians did differently and still fixed the machine; **Update this step** turns one into a new draft revision.
6. **Compare experts** takes a second technician's video of the same repair and shows where they differ and why it matters.

Guides and their videos are kept in the browser that captured them while the Core endpoint is being built.

## 4. Saving and publishing versions

- **Save** stores a draft you can keep editing.
- **Publish version** creates an official version that other modules use. The button is locked while the model has validation issues (a missing type, a missing parent, a required property left empty); fix them and publish.
- **Versions** lists published versions; **Compare latest versions** shows what changed between the two most recent.

## 5. Attaching dashboards to a plant

The **Dashboards** tab links the plant to Analytics dashboards:

- **New dashboard**: create a dashboard already linked to the plant.
- **Associate**: link an existing dashboard.
- **Make default**: choose the dashboard shown on the Overview tab.
- **Edit layout**: open the Analytics dashboard editor.

## 6. Configure

The **Configure** tab holds plant-specific settings (units, timezone, operational data sources). Only administrators or the engineer in charge should change them.

## 7. Suggested flow

Create plant → Model: Add node type and properties → New node down the tree → Save → Publish version → Dashboards: New dashboard or Associate → Overview for the summary.
