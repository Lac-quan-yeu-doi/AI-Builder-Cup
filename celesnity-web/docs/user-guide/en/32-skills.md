# Assistant skills

A **skill** is a short set of instructions that teaches the AI assistant how to do one thing the way your organization does it: "how net revenue is calculated", "the weekly report template", "our table naming rules". When your question matches a skill's description, the assistant reads that skill before answering. The **Skills** module sits under *Tools*.

## 1. Two kinds of skill

| Kind | Who creates it | Editable |
| --- | --- | --- |
| **Project skills** | People in your organization | Yes: edit and delete. |
| **Global skills** | Shipped with the platform | Read-only. |

## 2. Creating a skill

1. Open **Skills** and click **Create skill**.
2. **Name**: permanent; lowercase letters, digits and hyphens only (for example `weekly-report`). It cannot be changed later.
3. **Description**: one sentence starting with *"Use when…"* that describes the situation in which the assistant should apply the skill. This is the most important part: the assistant decides from this sentence whether to use the skill.
4. **Namespace** (optional): groups skills by team or topic.
5. **Markdown body**: the instructions themselves, written as you would brief a new colleague: steps, conventions, examples, things to avoid.
6. The **How the agent sees this skill** panel shows exactly what the assistant will read. Check it, then save.

## 3. Writing a skill that works

- One skill per job. "Weekly report" and "stock reconciliation" are two skills.
- Start with the expected outcome, then the steps in order.
- Name tables, columns and formulas exactly; the assistant uses them verbatim.
- Say what **not** to do (for example, do not count cancelled orders).
- Shorter is better; a long skill gets skimmed.

## 4. Editing, finding and deleting

- The search box filters by name and description.
- Click a project skill to edit its body; saving takes effect for new conversations immediately.
- **Delete** asks *"Delete this skill?"* first. A deleted skill is no longer used, but earlier answers are unchanged.

## 5. Letting the assistant draft a skill

The **Assistant** button on the Skills page opens the **Skill assistant** with a few starter prompts. Describe what you want to teach; the assistant drafts the skill, you review it and save. This is the quickest route when the format is new to you.

## 6. Checking that a skill is used

Go to **Home** and ask a question that fits the description. Open **View reasoning** on the answer: a step *Reading skill: <name>* means the skill was applied.
