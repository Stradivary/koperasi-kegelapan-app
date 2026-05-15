---
name: run-subtask
description: "Extract the next actionable subtask from a requirement or task specification, execute it, and update task completion status."
argument-hint: What requirement or task specification should this skill process?
disable-model-invocation: false
---

# Run Subtask Skill

## Purpose

This skill helps developers and agents turn a requirement or task specification into a concrete, workspace-aware subtask execution plan. It is designed for cases where a spec or task list exists and the next step is to perform the work and mark the task as done.

## When to Use

- You have a requirement document, implementation plan, or task list in the repository.
- You need to identify the next subtask, execute it, and record progress.
- The work should stay aligned with existing specs, docs, or repository conventions.

## Workflow

1. Review the referenced requirement/task specification in the workspace.
2. Extract the step-by-step subtask, acceptance criteria, and any explicit completion conditions.
3. Determine whether the current request is:
   - a direct code or doc change,
   - a planning/analysis step, or
   - a clarification request.
4. If the work is actionable:
   - apply the change to the repository,
   - keep edits aligned with existing structure and naming conventions,
   - preserve spec-driven decisions.
5. Update task status or relevant tracking artifacts to reflect progress.
6. Summarize what was done, including files changed and tasks completed.

## Decision Points

- If the spec is ambiguous, ask targeted questions instead of guessing.
- If multiple subtasks exist, choose the one that is most clearly defined and directly requestable.
- If the repository already contains a task-tracking or implementation plan file, update that file rather than leaving progress implicit.

## Quality Criteria

- Provides a clear link between the task spec and the implemented change.
- Avoids changes that violate repository conventions or the existing architecture.
- Includes a concise completion summary with next recommended step.
- Marks the performed subtask as done when the work is complete.

## Example Prompts

- "Use this skill to implement the next subtask from `.agents/specs/implementation-plan.md` and mark it as done."
- "Extract the action items from the current requirement and update the task status after applying the change."
- "Read the repository task spec, execute the next concrete task, and summarize the files modified."

## Related Customizations

- A check-list skill for validating spec alignment before implementation.
- A task-tracker skill that normalizes task state updates across `.agents/specs` and project docs.
- A spec-extraction skill that converts prose requirements into numbered subtasks.
