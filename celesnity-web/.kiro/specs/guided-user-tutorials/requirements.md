# Requirements Document

## Introduction

Guided User Tutorials add interactive, task-oriented learning to the Celesnity workspace. The feature complements the existing static Guide by helping members discover tutorials, select relevant workspace context, follow ordered instructions, interact with highlighted controls, retain progress, pause and resume work, and complete multiple tutorials independently.

The requirements cover member-facing tutorial behavior only. Technical design, implementation tasks, content-authoring tools, and source-code changes are outside the scope of this phase.

## Glossary

- **Guided_Tutorial_System**: The Celesnity capability that presents, runs, and tracks interactive tutorials in the Workspace.
- **Workspace**: The authenticated Celesnity product area containing destinations such as Home, Databases, Streaming, Plant model, Analytics, Query, Scripts, Skills, Automations, Documents, Guide, and Administration.
- **Workspace_Destination**: A page or route inside the Workspace.
- **Visible_Destination_State**: The currently presented content, member-entered values, selections, and scroll position of a Workspace Destination.
- **Workspace_Feature**: An access-controlled Celesnity capability associated with one or more Workspace Destinations.
- **Member**: An authenticated human identity with access to an organization in Celesnity.
- **Organization**: The Celesnity tenant in which a Member uses the Workspace.
- **Guide**: The existing Workspace resource that provides static explanatory content.
- **Tutorial_Definition**: The published description of one tutorial, including a unique identifier, metadata, access needs, prerequisites, context requirements, and ordered Tutorial Steps.
- **Published_Tutorial**: A Tutorial Definition approved for display to Members after publication validation succeeds.
- **Tutorial_Metadata**: The title, summary, category, learning outcomes, estimated duration, and step count of a Published Tutorial.
- **Tutorial_Catalog**: The discoverable collection of Published Tutorials available to a Member.
- **Catalog_View_State**: The active search term, Tutorial Status filters, and catalog scroll position.
- **Tutorial_Detail**: The selected tutorial view that presents Tutorial Metadata, Prerequisites, Tutorial Context, and a start or resume action.
- **Tutorial_Step**: One ordered unit of a Tutorial Definition containing Instructional Content and zero or one Required Action and zero or one Target Control.
- **Instructional_Content**: Text that explains the goal or procedure for a Tutorial Step.
- **Emphasized_Text**: A visually distinct portion of Instructional Content used to draw attention to a term, value, warning, or instruction.
- **Action_Callout**: A visually distinct, bounded instruction that tells a Member which action to perform for a Tutorial Step.
- **Target_Control**: The specific visible Workspace control associated with a Tutorial Step.
- **Required_Action**: A verifiable Member interaction that must succeed before a Tutorial Step can be completed.
- **Prerequisite**: A verifiable condition that must be satisfied before a tutorial can start or resume.
- **Remediation_Action**: An action or Workspace Destination that a Member can use to satisfy one unsatisfied Prerequisite.
- **Tutorial_Context**: The Member-selected Workspace resource used by a tutorial, such as a Database, data connection, pipeline, or other authorized resource.
- **Context_Requirement**: A Tutorial Definition rule that identifies the resource type and number of Tutorial Context selections required before start.
- **Eligible_Tutorial**: A Published Tutorial for which the Member has every required Workspace Feature, every Prerequisite is satisfied, and every Context Requirement has a valid selection.
- **Tutorial_Run**: One Member's execution of a Published Tutorial within an Organization.
- **Active_Tutorial_Run**: The single Tutorial Run currently displayed and accepting interaction.
- **Tutorial_Status**: The state of a Tutorial Run: Not Started, In Progress, Paused, or Completed.
- **Progress_Record**: The identity-scoped record containing Tutorial Status, current step, distinct completed steps, Tutorial Context identifiers, and update time for one Published Tutorial in one Organization.
- **Progress_Percentage**: A whole-number percentage from 0 through 100 calculated from distinct completed Tutorial Steps divided by total Tutorial Steps.
- **Resume_Point**: The first incomplete Tutorial Step stored in a Progress Record.
- **Completion_Record**: The record that uniquely identifies a completed Tutorial Run and the completion time.
- **Walkthrough_Panel**: The tutorial surface that displays the current Tutorial Step, progress, and navigation controls while a Tutorial Run is active.
- **Page_Dimming**: A visual treatment that reduces emphasis on the Workspace outside the current Target Control and Walkthrough Panel.
- **Spotlight_Overlay**: The visual layer that applies Page Dimming while leaving the complete Target Control highlighted.
- **Destination_Ready**: The state in which the requested Workspace Destination has finished presenting the controls required for Member interaction.
- **Onboarding_Invitation**: A non-blocking prompt that recommends starter tutorials to a Member who has not accepted or dismissed onboarding.
- **Onboarding_Decision**: The Member's acceptance or dismissal of the Onboarding Invitation within an Organization.
- **Tutorial_Entry**: A Workspace-level control that opens the Tutorial Catalog.
- **Tutorial_Control**: An interactive control provided by the Guided Tutorial System, including Tutorial Entry, catalog, detail, onboarding, walkthrough, retry, remediation, completion, and close controls.
- **Viewport**: The visible browser area available to the Workspace.
- **CSS_Pixel**: The browser-independent unit used to classify Viewport width.
- **Wide_Viewport**: A Viewport at least 1024 CSS_Pixels wide.
- **Narrow_Viewport**: A Viewport less than 1024 CSS_Pixels wide.
- **Keyboard_Focus**: The current interactive element that receives keyboard input.
- **Accessible_Name**: The text exposed by an interactive control to Assistive Technology.
- **Assistive_Technology**: Software such as a screen reader that communicates interface structure and state to a Member.
- **Reduced_Motion_Preference**: A Member's operating-system or browser request to minimize non-essential animation.
- **Supported_Locale**: An interface language supported by Celesnity, including English and Vietnamese.
- **Fallback_Locale**: The named Supported Locale used when tutorial content is unavailable in the Member's selected Supported Locale.
- **WCAG_2.2_Level_AA**: The Level AA success criteria in the Web Content Accessibility Guidelines version 2.2.
- **Sensitive_Value**: A credential, authentication secret, token, password, or private key.

## Requirements

### Requirement 1: Tutorial Portfolio

**User Story:** As a learning-content owner, I want Celesnity to support multiple valid structured tutorials, so that members can learn different workspace workflows.

#### Acceptance Criteria

1. THE Guided_Tutorial_System SHALL assign each Tutorial_Definition an identifier that is unique among Tutorial_Definitions.
2. WHEN a Tutorial_Definition is revised, THE Guided_Tutorial_System SHALL retain the Tutorial_Definition identifier across revisions.
3. THE Guided_Tutorial_System SHALL associate exactly one Tutorial_Metadata record with each Tutorial_Definition.
4. THE Guided_Tutorial_System SHALL associate a non-empty ordered collection of Tutorial_Steps with each Tutorial_Definition.
5. THE Guided_Tutorial_System SHALL explicitly identify every required Workspace_Feature for each Tutorial_Definition, including an empty requirement set.
6. THE Guided_Tutorial_System SHALL explicitly identify every Prerequisite for each Tutorial_Definition, including an empty prerequisite set.
7. THE Guided_Tutorial_System SHALL explicitly identify every Context_Requirement for each Tutorial_Definition, including an empty context requirement set.
8. THE Guided_Tutorial_System SHALL associate each Tutorial_Step with zero or one unambiguous Required_Action.
9. THE Guided_Tutorial_System SHALL associate each Tutorial_Step with zero or one unambiguous Target_Control.
10. WHEN a Tutorial_Definition satisfies the identifier, metadata, step, access, prerequisite, context, action, and target rules, THE Guided_Tutorial_System SHALL permit publication of the Tutorial_Definition.
11. IF a Tutorial_Definition violates a publication rule, THEN THE Guided_Tutorial_System SHALL reject publication with the violated rule identified.
12. WHEN publication is rejected, THE Guided_Tutorial_System SHALL retain the existing Tutorial_Catalog without modification.
13. THE Guided_Tutorial_System SHALL support more than one Published_Tutorial in the Tutorial_Catalog.

### Requirement 2: Tutorial Discovery

**User Story:** As a member, I want to discover tutorials from the workspace, so that I can find relevant guidance without leaving my current work.

#### Acceptance Criteria

1. WHILE a Member is using any Workspace_Destination, THE Guided_Tutorial_System SHALL make the Tutorial_Entry available in the Workspace shell.
2. WHEN a Member activates the Tutorial_Entry, THE Guided_Tutorial_System SHALL open the Tutorial_Catalog without replacing the current Workspace_Destination or resetting Visible_Destination_State.
3. WHILE the Tutorial_Catalog is open in a Wide_Viewport, THE Guided_Tutorial_System SHALL align the Tutorial_Catalog with the right side of the Workspace.
4. THE Guided_Tutorial_System SHALL display the complete Tutorial_Metadata for each tutorial listed in the Tutorial_Catalog.
5. THE Guided_Tutorial_System SHALL display the current Tutorial_Status for each tutorial listed in the Tutorial_Catalog.
6. WHERE a Progress_Record exists, THE Guided_Tutorial_System SHALL display the Progress_Percentage for the corresponding Published_Tutorial.
7. WHEN a Member submits a search term, THE Guided_Tutorial_System SHALL remove leading and trailing whitespace before matching the term case-insensitively against tutorial titles, summaries, and categories.
8. WHEN a Member selects one or more Tutorial_Status filters, THE Guided_Tutorial_System SHALL show Published_Tutorials that satisfy the search term and every active filter.
9. IF no Published_Tutorial matches the active search and filters, THEN THE Guided_Tutorial_System SHALL display a no-results state with an action that clears the active search and filters.
10. WHEN a Member activates the no-results clear action, THE Guided_Tutorial_System SHALL show the unfiltered Tutorial_Catalog from the beginning of the catalog list.
11. WHEN a Member selects a Published_Tutorial, THE Guided_Tutorial_System SHALL preserve the current Catalog_View_State before replacing the catalog list view with Tutorial_Detail.
12. WHEN a Member returns from Tutorial_Detail, THE Guided_Tutorial_System SHALL restore the preserved Catalog_View_State.

### Requirement 3: Tutorial Detail, Prerequisites, and Context

**User Story:** As a member, I want to understand tutorial scope and readiness before starting, so that I can choose an appropriate tutorial and provide the required context.

#### Acceptance Criteria

1. WHEN a Member opens Tutorial_Detail, THE Guided_Tutorial_System SHALL display the selected Tutorial_Metadata.
2. WHEN a Member opens Tutorial_Detail, THE Guided_Tutorial_System SHALL evaluate every Prerequisite against the current Member and Organization state.
3. THE Guided_Tutorial_System SHALL display the satisfied or unsatisfied state of each Prerequisite.
4. IF a Prerequisite is unsatisfied, THEN THE Guided_Tutorial_System SHALL provide one usable Remediation_Action for the unsatisfied Prerequisite.
5. WHILE any Prerequisite is unsatisfied, THE Guided_Tutorial_System SHALL make the start action unavailable.
6. WHERE a Context_Requirement exists, THE Guided_Tutorial_System SHALL display a selector for each required Tutorial_Context selection.
7. WHERE a Context_Requirement exists, THE Guided_Tutorial_System SHALL limit each selector to accessible resources that match the resource type required by the Context_Requirement in the current Organization.
8. WHILE any Context_Requirement lacks a valid selection, THE Guided_Tutorial_System SHALL make the start action unavailable.
9. WHEN a Member selects Tutorial_Context, THE Guided_Tutorial_System SHALL display the selected resource name in Tutorial_Detail.
10. IF a selected Tutorial_Context becomes unavailable before start, THEN THE Guided_Tutorial_System SHALL clear only the unavailable selection.
11. WHEN an unavailable Tutorial_Context selection is cleared, THE Guided_Tutorial_System SHALL identify the Context_Requirement that needs a replacement selection.
12. WHILE every Prerequisite is satisfied and every Context_Requirement has a currently valid selection, THE Guided_Tutorial_System SHALL make the start action available.
13. IF any Prerequisite or Tutorial_Context becomes invalid before start, THEN THE Guided_Tutorial_System SHALL make the start action unavailable.

### Requirement 4: Member Onboarding

**User Story:** As a new member, I want optional onboarding recommendations, so that I can learn the most relevant first workflows.

#### Acceptance Criteria

1. WHEN a Member enters the Workspace without an Onboarding_Decision for the current Organization, THE Guided_Tutorial_System SHALL display the Onboarding_Invitation.
2. WHILE the Onboarding_Invitation is displayed, THE Guided_Tutorial_System SHALL keep the Workspace operable.
3. WHEN accessible onboarding recommendations exist, THE Guided_Tutorial_System SHALL recommend at least one Published_Tutorial for which the Member can access every required Workspace_Feature.
4. IF no accessible onboarding recommendation exists, THEN THE Guided_Tutorial_System SHALL state that no starter tutorial is currently available.
5. IF no accessible onboarding recommendation exists, THEN THE Guided_Tutorial_System SHALL provide a dismissal action in the Onboarding_Invitation.
6. WHEN a Member accepts the Onboarding_Invitation, THE Guided_Tutorial_System SHALL persist an accepted Onboarding_Decision for the Member and Organization.
7. WHEN an accepted Onboarding_Decision is persisted, THE Guided_Tutorial_System SHALL open Tutorial_Detail for the selected recommendation.
8. WHEN a Member dismisses the Onboarding_Invitation, THE Guided_Tutorial_System SHALL persist a dismissed Onboarding_Decision for the Member and Organization.
9. WHEN a dismissed Onboarding_Decision is persisted, THE Guided_Tutorial_System SHALL close the Onboarding_Invitation.
10. WHILE a dismissed Onboarding_Decision exists, THE Guided_Tutorial_System SHALL omit automatic presentation of the Onboarding_Invitation.
11. WHILE a dismissed Onboarding_Decision exists, THE Guided_Tutorial_System SHALL keep eligible onboarding tutorials discoverable through the Tutorial_Catalog.
12. IF an Onboarding_Decision cannot be persisted, THEN THE Guided_Tutorial_System SHALL retain the Onboarding_Invitation.
13. IF an Onboarding_Decision cannot be persisted, THEN THE Guided_Tutorial_System SHALL explain the persistence failure.

### Requirement 5: Starting a Tutorial

**User Story:** As a member, I want to start a prepared tutorial, so that I can begin the walkthrough in the correct workspace context.

#### Acceptance Criteria

1. WHEN a Member starts an Eligible_Tutorial with no existing Progress_Record and no Active_Tutorial_Run, THE Guided_Tutorial_System SHALL create exactly one Tutorial_Run at the first Tutorial_Step.
2. WHEN a new Tutorial_Run is created, THE Guided_Tutorial_System SHALL set Tutorial_Status to In Progress.
3. WHEN a new Tutorial_Run starts, THE Guided_Tutorial_System SHALL navigate to the Workspace_Destination required by the first Tutorial_Step.
4. WHEN the first Workspace_Destination is Destination_Ready, THE Guided_Tutorial_System SHALL open the Walkthrough_Panel at the first Tutorial_Step.
5. WHILE an Active_Tutorial_Run exists, THE Guided_Tutorial_System SHALL permit only one Active_Tutorial_Run for the Member.
6. WHEN a Member attempts to start another Published_Tutorial during an Active_Tutorial_Run, THE Guided_Tutorial_System SHALL request a choice between pausing the Active_Tutorial_Run and cancelling the new start.
7. WHEN a Member cancels a conflicting start, THE Guided_Tutorial_System SHALL preserve the Tutorial_Status, current Tutorial_Step, and completed-step records of the Active_Tutorial_Run.
8. WHEN a Member chooses to pause the Active_Tutorial_Run, THE Guided_Tutorial_System SHALL complete the pause behavior in Requirement 10 before creating another Tutorial_Run.
9. IF pausing the Active_Tutorial_Run fails, THEN THE Guided_Tutorial_System SHALL cancel the new start.
10. IF the first Workspace_Destination does not become Destination_Ready, THEN THE Guided_Tutorial_System SHALL retain the Tutorial_Run at the first Tutorial_Step.
11. IF the first Workspace_Destination does not become Destination_Ready, THEN THE Guided_Tutorial_System SHALL provide retry and pause actions with the destination failure identified.

### Requirement 6: Walkthrough Content and Presentation

**User Story:** As a member, I want clear step-by-step instructions beside my workspace, so that I can follow a tutorial while performing the work.

#### Acceptance Criteria

1. WHILE a Tutorial_Run is active in a Wide_Viewport, THE Guided_Tutorial_System SHALL present the Workspace and a right-aligned Walkthrough_Panel simultaneously without overlap.
2. WHILE a Tutorial_Run is active, THE Guided_Tutorial_System SHALL display the complete tutorial title in the Walkthrough_Panel.
3. WHILE a Tutorial_Run is active, THE Guided_Tutorial_System SHALL display the current Tutorial_Step number and total Tutorial_Step count.
4. WHILE a Tutorial_Run is active, THE Guided_Tutorial_System SHALL display the complete current Tutorial_Step title and Instructional_Content.
5. WHERE a Tutorial_Step contains Emphasized_Text, THE Guided_Tutorial_System SHALL render the Emphasized_Text visually distinct from surrounding Instructional_Content.
6. WHERE a Tutorial_Step contains an Action_Callout, THE Guided_Tutorial_System SHALL render the Action_Callout in a visually distinct bounded region.
7. WHERE a Tutorial_Step identifies a Target_Control, THE Guided_Tutorial_System SHALL display the Target_Control Accessible_Name in the Walkthrough_Panel.
8. WHILE a Tutorial_Step-triggered Workspace_Destination transition is occurring, THE Guided_Tutorial_System SHALL preserve the Tutorial_Run identifier, current Tutorial_Step, and completed-step records.
9. IF a Tutorial_Step-triggered Workspace_Destination transition fails, THEN THE Guided_Tutorial_System SHALL retain the current Tutorial_Step and completed-step records.
10. IF a Tutorial_Step-triggered Workspace_Destination transition fails, THEN THE Guided_Tutorial_System SHALL identify the transition failure and provide retry and pause actions.

### Requirement 7: Spotlight and Target Highlighting

**User Story:** As a member, I want the relevant control highlighted, so that I can identify where to act on each step.

#### Acceptance Criteria

1. WHERE a Tutorial_Step has a Target_Control, WHEN the Workspace_Destination is Destination_Ready, THE Guided_Tutorial_System SHALL apply a Spotlight_Overlay that exposes the complete Target_Control.
2. WHILE a Spotlight_Overlay is active, THE Guided_Tutorial_System SHALL apply Page_Dimming only outside the Target_Control and Walkthrough_Panel.
3. WHILE a Spotlight_Overlay is active, THE Guided_Tutorial_System SHALL preserve the visible content and interaction state of the Target_Control.
4. WHILE a Spotlight_Overlay is active, THE Guided_Tutorial_System SHALL keep the Target_Control and Tutorial_Controls operable.
5. WHEN any part of a Target_Control is outside the visible or unobstructed Viewport, THE Guided_Tutorial_System SHALL bring the complete Target_Control into an unobstructed visible area before applying the Spotlight_Overlay.
6. WHEN the Target_Control position changes because of scrolling, resizing, or Workspace layout changes, THE Guided_Tutorial_System SHALL realign the Spotlight_Overlay with the complete Target_Control.
7. IF a Target_Control cannot be located after Destination_Ready, THEN THE Guided_Tutorial_System SHALL block Tutorial_Step completion.
8. IF a Target_Control cannot be located after Destination_Ready, THEN THE Guided_Tutorial_System SHALL retain the current Tutorial_Step and completed-step records.
9. IF a Target_Control cannot be located after Destination_Ready, THEN THE Guided_Tutorial_System SHALL provide retry and pause actions with the target failure identified.
10. WHERE a Tutorial_Step has no Target_Control, THE Guided_Tutorial_System SHALL omit Page_Dimming for the Tutorial_Step.
11. WHILE a Spotlight_Overlay is active, THE Guided_Tutorial_System SHALL expose a programmatic description of the highlighted Target_Control to Assistive_Technology.

### Requirement 8: Step Navigation and Action Completion

**User Story:** As a member, I want predictable navigation and action-aware progression, so that I can move through a tutorial without skipping required work accidentally.

#### Acceptance Criteria

1. WHILE a Tutorial_Run is active, THE Guided_Tutorial_System SHALL display Previous and Next controls in the Walkthrough_Panel.
2. WHILE the first Tutorial_Step is current, THE Guided_Tutorial_System SHALL make the Previous control unavailable.
3. WHEN a Member activates an unavailable Previous control, THE Guided_Tutorial_System SHALL retain the current Tutorial_Step.
4. WHERE a Tutorial_Step has no Required_Action, THE Guided_Tutorial_System SHALL make the Next control available.
5. WHILE a Tutorial_Step has an incomplete Required_Action, THE Guided_Tutorial_System SHALL make the Next control unavailable.
6. WHEN a Member activates an unavailable Next control, THE Guided_Tutorial_System SHALL retain the current Tutorial_Step.
7. WHEN a Required_Action succeeds for the first time, THE Guided_Tutorial_System SHALL mark the current Tutorial_Step complete.
8. WHEN a Required_Action succeeds, THE Guided_Tutorial_System SHALL make the Next control available.
9. IF a Required_Action fails, THEN THE Guided_Tutorial_System SHALL retain the current Tutorial_Step in an incomplete state.
10. IF a Required_Action fails, THEN THE Guided_Tutorial_System SHALL identify the action failure.
11. WHEN a Member activates Previous, THE Guided_Tutorial_System SHALL display the preceding Tutorial_Step without clearing completed-step records.
12. WHEN a Member activates Next, THE Guided_Tutorial_System SHALL persist completion of the current Tutorial_Step before displaying the following Tutorial_Step.
13. WHEN a following Tutorial_Step requires a different Workspace_Destination, THE Guided_Tutorial_System SHALL make the following Tutorial_Step available only after the required Workspace_Destination is Destination_Ready.
14. WHILE a required Workspace_Destination transition is incomplete, THE Guided_Tutorial_System SHALL make Previous and Next controls unavailable.
15. IF a required Workspace_Destination transition fails, THEN THE Guided_Tutorial_System SHALL retain the current Tutorial_Step and completed-step records.
16. IF a required Workspace_Destination transition fails, THEN THE Guided_Tutorial_System SHALL identify the destination failure and provide retry and pause actions.
17. WHILE the final Tutorial_Step is current and complete, THE Guided_Tutorial_System SHALL label the forward control as Finish.
18. WHEN a Member activates Finish, THE Guided_Tutorial_System SHALL apply the completion behavior in Requirement 11 without advancing beyond the final Tutorial_Step.

### Requirement 9: Progress Tracking and Persistence

**User Story:** As a member, I want tutorial progress saved per tutorial, so that I can understand completion and continue across work sessions.

#### Acceptance Criteria

1. THE Guided_Tutorial_System SHALL isolate each Progress_Record by Member, Organization, and Published_Tutorial.
2. THE Guided_Tutorial_System SHALL calculate Progress_Percentage by dividing the number of distinct completed Tutorial_Steps by the non-zero total Tutorial_Step count and multiplying by 100.
3. THE Guided_Tutorial_System SHALL round Progress_Percentage to the nearest whole number with one-half values rounded upward.
4. THE Guided_Tutorial_System SHALL constrain Progress_Percentage to the inclusive range from 0 through 100.
5. WHEN a Tutorial_Step is completed for the first time, THE Guided_Tutorial_System SHALL add the Tutorial_Step once to the completed-step records.
6. WHEN a Member revisits an already completed Tutorial_Step, THE Guided_Tutorial_System SHALL retain the existing completed-step record without increasing Progress_Percentage.
7. WHEN a Member moves to a different Tutorial_Step, THE Guided_Tutorial_System SHALL persist the current Tutorial_Step in the Progress_Record.
8. WHEN a Tutorial_Run is paused, THE Guided_Tutorial_System SHALL persist Tutorial_Status and Resume_Point before confirming the pause.
9. WHEN a Tutorial_Run is completed, THE Guided_Tutorial_System SHALL persist Tutorial_Status before confirming completion.
10. WHEN the same Member returns to the same Organization in a later authenticated session, THE Guided_Tutorial_System SHALL restore the latest successfully persisted Progress_Record for each accessible Published_Tutorial before enabling resume.
11. WHEN a restored Progress_Record has incomplete Tutorial_Steps, THE Guided_Tutorial_System SHALL display Tutorial_Status as Paused or In Progress according to the persisted Tutorial_Status.
12. WHEN a restored Progress_Record has every Tutorial_Step complete and persisted Tutorial_Status Completed, THE Guided_Tutorial_System SHALL display Tutorial_Status as Completed.
13. IF a Progress_Record update cannot be persisted, THEN THE Guided_Tutorial_System SHALL retain the latest successfully persisted Progress_Record without overwriting the Progress_Record.
14. IF a Progress_Record update cannot be persisted, THEN THE Guided_Tutorial_System SHALL preserve the current visible Tutorial_Run state and identify the persistence failure.
15. IF Progress_Record restoration fails, THEN THE Guided_Tutorial_System SHALL make resume unavailable for the affected Published_Tutorial.
16. IF Progress_Record restoration fails, THEN THE Guided_Tutorial_System SHALL identify the restoration failure without overwriting the unavailable Progress_Record.

### Requirement 10: Pause and Resume

**User Story:** As a member, I want to pause and resume a tutorial, so that I can interrupt guided work without losing my place.

#### Acceptance Criteria

1. WHILE a Tutorial_Run is active, THE Guided_Tutorial_System SHALL provide a Pause control in the Walkthrough_Panel.
2. WHEN a Member activates Pause, THE Guided_Tutorial_System SHALL persist Tutorial_Status Paused and the Resume_Point before confirming the pause.
3. WHEN a pause is successfully persisted, THE Guided_Tutorial_System SHALL close the Walkthrough_Panel and remove Page_Dimming.
4. WHEN a Member closes the Walkthrough_Panel before completion, THE Guided_Tutorial_System SHALL apply the same persistence behavior as the Pause control.
5. WHEN a Member signs out during an Active_Tutorial_Run, THE Guided_Tutorial_System SHALL persist Tutorial_Status Paused and the Resume_Point before ending the authenticated session.
6. IF pause persistence fails, THEN THE Guided_Tutorial_System SHALL retain Tutorial_Status In Progress.
7. IF pause persistence fails while the authenticated session remains active, THEN THE Guided_Tutorial_System SHALL retain the Walkthrough_Panel and identify the persistence failure.
8. WHEN a Member selects Resume for a Paused tutorial, THE Guided_Tutorial_System SHALL re-evaluate every required Workspace_Feature against the current Member and Organization state.
9. WHEN a Member selects Resume for a Paused tutorial, THE Guided_Tutorial_System SHALL re-evaluate every Prerequisite against the current Member and Organization state.
10. WHEN a Member selects Resume for a Paused tutorial, THE Guided_Tutorial_System SHALL revalidate every saved Tutorial_Context against the current Member, Organization, and Context_Requirement.
11. IF a saved Tutorial_Context is invalid, THEN THE Guided_Tutorial_System SHALL request a replacement selection for the affected Context_Requirement.
12. IF a required Workspace_Feature, Prerequisite, or Tutorial_Context is invalid, THEN THE Guided_Tutorial_System SHALL retain Tutorial_Status Paused and identify every blocking condition.
13. WHEN every resume access, prerequisite, and context validation succeeds, THE Guided_Tutorial_System SHALL navigate to the Workspace_Destination required by the Resume_Point.
14. IF the Resume_Point Workspace_Destination does not become Destination_Ready, THEN THE Guided_Tutorial_System SHALL retain Tutorial_Status Paused and identify the destination blocker.
15. WHEN the Resume_Point Workspace_Destination is Destination_Ready, THE Guided_Tutorial_System SHALL set Tutorial_Status to In Progress.
16. WHEN Tutorial_Status is restored to In Progress after resume validation, THE Guided_Tutorial_System SHALL reopen the Walkthrough_Panel at the first incomplete Tutorial_Step.

### Requirement 11: Tutorial Completion and Repetition

**User Story:** As a member, I want clear completion feedback and the ability to repeat a tutorial, so that I can confirm learning and revisit a workflow.

#### Acceptance Criteria

1. WHEN a Member activates Finish after completing the final Tutorial_Step, THE Guided_Tutorial_System SHALL persist Tutorial_Status Completed and one Completion_Record as a single completion outcome for the Tutorial_Run.
2. WHEN the completion outcome is successfully persisted, THE Guided_Tutorial_System SHALL close the Spotlight_Overlay and remove Page_Dimming.
3. WHEN the completion outcome is successfully persisted, THE Guided_Tutorial_System SHALL display a completion summary containing the tutorial title, completed learning outcomes, and completion timestamp.
4. WHEN a completion summary is displayed, THE Guided_Tutorial_System SHALL offer a return-to-workspace action.
5. WHERE another Eligible_Tutorial exists, THE Guided_Tutorial_System SHALL offer at least one next-tutorial recommendation in the completion summary.
6. WHEN a completion request is repeated for the same Tutorial_Run, THE Guided_Tutorial_System SHALL retain one Completion_Record for the Tutorial_Run.
7. IF the completion outcome cannot be persisted, THEN THE Guided_Tutorial_System SHALL retain the pre-completion Tutorial_Status and final Tutorial_Step state.
8. IF the completion outcome cannot be persisted, THEN THE Guided_Tutorial_System SHALL identify the completion persistence failure.
9. WHEN a Member chooses to repeat a Completed tutorial, THE Guided_Tutorial_System SHALL request confirmation before changing the completed Progress_Record.
10. WHILE repeat confirmation is pending, THE Guided_Tutorial_System SHALL preserve the Completed Tutorial_Status and Completion_Record.
11. WHEN a Member declines repeat confirmation, THE Guided_Tutorial_System SHALL preserve the Completed Tutorial_Status and Completion_Record.
12. WHEN a Member confirms repetition, THE Guided_Tutorial_System SHALL create a new Tutorial_Run with Tutorial_Status In Progress and no completed Tutorial_Steps.
13. WHEN a Member confirms repetition, THE Guided_Tutorial_System SHALL preserve every prior Completion_Record for the Published_Tutorial.

### Requirement 12: Access Control and Safe Guided Actions

**User Story:** As an organization member, I want tutorials to respect my workspace access and normal safeguards, so that guidance cannot expose or bypass restricted capabilities.

#### Acceptance Criteria

1. THE Guided_Tutorial_System SHALL include a Published_Tutorial in the Tutorial_Catalog only when the Member can access every Workspace_Feature required by the Published_Tutorial under existing Workspace authorization rules.
2. WHEN the Guided_Tutorial_System lists Tutorial_Context options, THE Guided_Tutorial_System SHALL apply existing Member and Organization authorization rules.
3. THE Guided_Tutorial_System SHALL omit identifiers, names, metadata, and status details for inaccessible tutorials and resources from member-facing tutorial surfaces.
4. WHEN a Required_Action invokes an existing Workspace operation, THE Guided_Tutorial_System SHALL use the same Member inputs as the unguided Workspace operation.
5. WHEN a Required_Action invokes an existing Workspace operation, THE Guided_Tutorial_System SHALL apply the same authorization and validation rules as the unguided Workspace operation.
6. WHEN a Required_Action invokes an existing Workspace operation, THE Guided_Tutorial_System SHALL preserve the same confirmation behavior and outcomes as the unguided Workspace operation.
7. THE Guided_Tutorial_System SHALL exclude Sensitive_Values from Progress_Records, Completion_Records, tutorial surfaces, and Assistive_Technology descriptions.
8. IF access to a required Workspace_Feature is removed during an Active_Tutorial_Run, THEN THE Guided_Tutorial_System SHALL persist existing progress before setting Tutorial_Status to Paused.
9. WHEN access loss pauses a Tutorial_Run, THE Guided_Tutorial_System SHALL identify the access change without revealing inaccessible tutorial or resource details.
10. IF a Published_Tutorial becomes inaccessible after a Progress_Record was created, THEN THE Guided_Tutorial_System SHALL retain the Progress_Record without revealing inaccessible tutorial or resource details.
11. WHILE a saved Published_Tutorial is inaccessible, THE Guided_Tutorial_System SHALL make resume unavailable for the saved Tutorial_Run.

### Requirement 13: Responsive, Accessible, and Localized Experience

**User Story:** As a member, I want tutorials to work with my device, language, and interaction needs, so that I can complete guidance effectively.

#### Acceptance Criteria

1. WHILE a Tutorial_Catalog or Walkthrough_Panel is open in a Narrow_Viewport, THE Guided_Tutorial_System SHALL keep tutorial content and Tutorial_Controls within the Viewport without horizontal scrolling.
2. WHILE a Spotlight_Overlay is active in a Narrow_Viewport, THE Guided_Tutorial_System SHALL present the complete Target_Control and Tutorial_Controls without overlap.
3. THE Guided_Tutorial_System SHALL make every Tutorial_Control reachable through keyboard navigation.
4. THE Guided_Tutorial_System SHALL make every Tutorial_Control activatable through a keyboard interaction appropriate to the control role.
5. WHEN the Tutorial_Catalog opens and at least one Published_Tutorial is available, THE Guided_Tutorial_System SHALL move Keyboard_Focus to the first available tutorial.
6. IF the Tutorial_Catalog opens without an available Published_Tutorial, THEN THE Guided_Tutorial_System SHALL move Keyboard_Focus to the Tutorial_Catalog heading.
7. WHEN the Walkthrough_Panel opens for a Tutorial_Step with a Target_Control, THE Guided_Tutorial_System SHALL provide a keyboard navigation path between the Walkthrough_Panel and Target_Control.
8. WHEN the Tutorial_Catalog or Walkthrough_Panel closes, THE Guided_Tutorial_System SHALL return Keyboard_Focus to the Tutorial_Control that opened the closed surface when the Tutorial_Control remains available.
9. IF the Tutorial_Control that opened a closed surface is unavailable, THEN THE Guided_Tutorial_System SHALL move Keyboard_Focus to the nearest available Workspace heading or Workspace navigation control.
10. WHEN the current Tutorial_Step changes, THE Guided_Tutorial_System SHALL announce the complete step title and step position to Assistive_Technology.
11. WHERE the current Tutorial_Step has a Target_Control, WHEN the current Tutorial_Step changes, THE Guided_Tutorial_System SHALL announce the programmatic Target_Control description to Assistive_Technology.
12. WHILE Reduced_Motion_Preference is active, THE Guided_Tutorial_System SHALL replace non-essential spotlight, scrolling, and panel movement with immediate visual transitions.
13. THE Guided_Tutorial_System SHALL provide normal-sized tutorial text with a contrast ratio of at least 4.5 to 1.
14. THE Guided_Tutorial_System SHALL provide large tutorial text, Tutorial_Controls, and meaningful graphical tutorial indicators with a contrast ratio of at least 3 to 1.
15. WHEN a Member changes to another Supported_Locale, THE Guided_Tutorial_System SHALL present tutorial interface labels in the selected Supported_Locale.
16. WHEN tutorial content is available in the selected Supported_Locale, THE Guided_Tutorial_System SHALL present tutorial content in the selected Supported_Locale.
17. IF tutorial content is unavailable in the selected Supported_Locale, THEN THE Guided_Tutorial_System SHALL identify the named Fallback_Locale before displaying fallback content.
