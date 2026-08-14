/**
 * Template describes a reusable workflow for a showcase event.
 * A template has an id, name, and description, plus an ordered array of steps.
 *
 * @typedef {Object} Template
 * @property {string} id - Unique identifier for the template
 * @property {string} name - Display name
 * @property {string} description - Description of what this template is for
 * @property {Step[]} steps - Ordered array of steps in this workflow
 * @property {Variable[]} [variables] - Named placeholders filled in when a run is created; referenced in step titles/descriptions as {{key}}
 */

/**
 * Variable is a named placeholder defined at the template level and filled in
 * when a workflow is run. Referenced inside step titles/descriptions as {{key}}.
 *
 * @typedef {Object} Variable
 * @property {string} id - Unique identifier for this variable
 * @property {string} key - The token name used in {{key}} references (no spaces)
 * @property {string} label - Human-friendly label shown when filling the variable in
 * @property {string} defaultValue - Value pre-filled when running the workflow
 */

/**
 * Step is a single task within a template.
 *
 * @typedef {Object} Step
 * @property {string} id - Unique identifier within the template
 * @property {string} title - Task title / what needs to happen
 * @property {string} description - Additional context about this step
 * @property {"task"|"approval"} [stepType] - Kind of step; "approval" requires sign-off before the next step unlocks. Defaults to "task".
 * @property {DueRule} dueRule - Rule for calculating when this step is due
 * @property {string} [dueDate] - Optional explicit deadline (ISO YYYY-MM-DD); defaults to "" when the step is driven purely by dueRule
 * @property {Field[]} fields - Custom fields for this step (e.g., assignee options, metadata)
 * @property {Condition} [condition] - Optional condition to determine if this step is active in a run
 */

/**
 * Condition determines whether a step (and its tasks) are active in a run.
 * Evaluates against field values from other steps in the same run.
 *
 * @typedef {Object} Condition
 * @property {string} fieldId - ID of the field to check (from any step's fields)
 * @property {"equals"|"not_equals"|"greater_than"|"less_than"} operator - Comparison operator
 * @property {any} value - The value to compare against
 */

/**
 * DueRule determines when a step is due relative to the event date.
 *
 * @typedef {Object} DueRule
 * @property {"relative"|"fixed"} type - "relative" for offsets from event day, "fixed" for specific dates
 * @property {number} [weeksFromStart] - For relative rules, the offset in weeks (negative = before event, 0 = event day, positive = after)
 * @property {string} [date] - For fixed rules, an ISO date string (YYYY-MM-DD)
 */

/**
 * Field is a custom field that can be associated with a step.
 * Used for things like department selection, assignee pools, status options, etc.
 *
 * @typedef {Object} Field
 * @property {string} id - Unique identifier for this field
 * @property {string} label - Display label
 * @property {string} type - Field type (e.g., "text", "select", "multiselect", etc.)
 * @property {string[]} [options] - For select-type fields, the available options
 */

/**
 * Run represents an instance of work derived from a Template.
 * A Run contains concrete tasks with computed due dates for a specific event at a specific branch.
 *
 * @typedef {Object} Run
 * @property {string} id - Unique identifier (run-${timestamp})
 * @property {string} templateId - ID of the template this run was created from
 * @property {Object} branch - Branch object for this run (e.g., { name, short, pic, region })
 * @property {string} startDate - ISO date string (YYYY-MM-DD) of the event date
 * @property {Object} [variables] - Resolved {key: value} map of template variables used to instantiate this run
 * @property {RunTask[]} tasks - Array of tasks, one per template step, in order
 */

/**
 * RunTask represents a concrete task within a Run.
 *
 * @typedef {Object} RunTask
 * @property {string} id - Unique identifier within the run (run-${timestamp}-${stepId})
 * @property {string} stepId - ID of the step in the template
 * @property {string} title - Task title
 * @property {string} description - Task description
 * @property {"task"|"approval"} [stepType] - Carried through from the step; "approval" tasks are approved/rejected instead of checked off. Defaults to "task".
 * @property {string} dept - Department responsible
 * @property {string[]} dependsOn - IDs of tasks that must be completed first (task IDs, not step IDs)
 * @property {string} dueDate - ISO date string (YYYY-MM-DD)
 * @property {"standing-by"|"on-deck"|"missed"|"delivered"|"approved"|"rejected"} status - Current status
 * @property {string|null} assignee - Person assigned to this task (null for unassigned)
 * @property {Object} values - Form field values, if any have been filled out
 * @property {boolean} active - Whether this task is active based on conditions; tasks without conditions are always active
 * @property {{id: string, author: string, text: string, timestamp: string}[]} [comments] - Comment thread on this task. Defaults to [].
 */

/**
 * Evaluates a single condition value against an operator and target value.
 * @param {any} fieldValue - The value from a field
 * @param {"equals"|"not_equals"|"greater_than"|"less_than"} operator - Comparison operator
 * @param {any} value - The target value to compare against
 * @returns {boolean} True if the condition is met
 */
function evaluateCondition(fieldValue, operator, value) {
  switch (operator) {
    case "equals":
      return fieldValue === value;
    case "not_equals":
      return fieldValue !== value;
    case "greater_than":
      return fieldValue > value;
    case "less_than":
      return fieldValue < value;
    default:
      return true;
  }
}

/**
 * Evaluates all conditions in a run and sets the active flag on each task.
 * A task is active if its step has no condition, or if the condition is met.
 * Conditions are evaluated against field values from other tasks in the same run.
 *
 * @param {Run} run - The run to evaluate
 * @param {Template} template - The template the run was created from
 * @returns {Run} A new run with active flags set on all tasks
 */
export function evaluateConditions(run, template) {
  // A task is blocked if any task it depends on is an approval step that has
  // not yet been approved. This gates the downstream task off regardless of
  // whether it also has a condition.
  const isApprovalBlocked = (task) =>
    (task.dependsOn || []).some((depId) => {
      const dep = run.tasks.find(t => t.id === depId);
      if (!dep) return false;
      const depStep = template.steps.find(s => s.id === dep.stepId);
      const depIsApproval = (depStep?.stepType ?? dep.stepType) === "approval";
      return depIsApproval && dep.status !== "approved";
    });

  const tasksWithActive = run.tasks.map((task) => {
    if (isApprovalBlocked(task)) {
      return { ...task, active: false };
    }

    const step = template.steps.find(s => s.id === task.stepId);

    if (!step || !step.condition) {
      return { ...task, active: true };
    }

    const { fieldId, operator, value } = step.condition;

    // Find which task answered this field
    const answerTask = run.tasks.find(t => {
      const stepForTask = template.steps.find(s => s.id === t.stepId);
      return stepForTask && stepForTask.fields && stepForTask.fields.some(f => f.id === fieldId);
    });

    if (!answerTask) {
      // Field hasn't been answered yet, so condition is not met
      return { ...task, active: false };
    }

    const fieldValue = answerTask.values[fieldId];
    const conditionMet = evaluateCondition(fieldValue, operator, value);

    return { ...task, active: conditionMet };
  });

  return {
    ...run,
    tasks: tasksWithActive,
  };
}

/**
 * Sets a field value on a task within a run and re-evaluates all conditions.
 * Returns a new run; does not mutate the original.
 * Useful for form inputs that should trigger condition re-evaluation.
 *
 * @param {Run} run - The run to update
 * @param {Template} template - The template (needed to re-evaluate conditions)
 * @param {string} taskId - ID of the task to update
 * @param {string} fieldId - ID of the field to set
 * @param {any} value - The new value for the field
 * @returns {Run} A new run with the field value set and conditions re-evaluated
 */
export function setFieldValue(run, template, taskId, fieldId, value) {
  const updatedRun = {
    ...run,
    tasks: run.tasks.map(task =>
      task.id === taskId
        ? { ...task, values: { ...task.values, [fieldId]: value } }
        : task
    ),
  };

  return evaluateConditions(updatedRun, template);
}

/**
 * Flips the done flag on a single subtask within a run's task, immutably.
 * Mirrors setFieldValue: map over tasks, and within the matched task map over
 * its subtasks. Subtasks don't affect conditions, so no re-evaluation is needed.
 *
 * @param {Run} run
 * @param {string} taskId
 * @param {string} subtaskId
 * @returns {Run} A new Run with the subtask's done flag toggled
 */
export function toggleSubtask(run, taskId, subtaskId) {
  return {
    ...run,
    tasks: run.tasks.map(task =>
      task.id === taskId
        ? {
            ...task,
            subtasks: (task.subtasks ?? []).map(st =>
              st.id === subtaskId ? { ...st, done: !st.done } : st
            ),
          }
        : task
    ),
  };
}

/**
 * Groups an array of RunTasks into ordered buckets by a caller-supplied key,
 * without altering the tasks themselves. Mirrors the "same data, many views"
 * idea: tasks are stored once, and a Kanban-style board is just this grouping
 * applied on top at render time.
 *
 * @param {RunTask[]} tasks - Tasks to group
 * @param {(task: RunTask) => string} keyFn - Computes the group key for a task
 * @param {string[]} [order] - Keys that should appear first, in this order, when present;
 *   any other keys found in the data are appended afterward, sorted alphabetically
 * @returns {{key: string, tasks: RunTask[]}[]} Groups in display order
 */
export function groupTasksByField(tasks, keyFn, order = []) {
  const groups = new Map();
  (tasks || []).forEach((task) => {
    const key = keyFn(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });

  const remaining = [...groups.keys()].filter((k) => !order.includes(k)).sort();
  const orderedKeys = [...order.filter((k) => groups.has(k)), ...remaining];

  return orderedKeys.map((key) => ({ key, tasks: groups.get(key) }));
}

/**
 * Computes an absolute due date from a start date and a week offset.
 * Mirrors dueRule.weeksFromStart: the offset is applied in whole weeks from the
 * start date (negative = before the start, 0 = on the start day, positive = after).
 *
 * @param {string} startDate - ISO date string (YYYY-MM-DD) to offset from
 * @param {number} weeksFromStart - Offset in weeks
 * @returns {Date} A JS Date (local midnight) for the computed due date
 */
export function computeDueDate(startDate, weeksFromStart) {
  const d = new Date(startDate + "T00:00:00");
  d.setDate(d.getDate() + weeksFromStart * 7);
  return d;
}

/**
 * Resolves {{field_label}} variables in a piece of text against the field
 * values collected from a run's tasks. Any {{label}} whose label matches a
 * filled-in field is replaced inline with that field's value; variables with no
 * match (or an empty value) are left untouched as "{{label}}", so the caller can
 * style the leftovers as unresolved.
 *
 * Each task is expected to carry its field definitions (fields: [{ id, label }])
 * alongside its answered values (values: { [fieldId]: value }); tasks missing
 * either simply contribute nothing to the lookup.
 *
 * @param {string} text - Text possibly containing {{field_label}} tokens
 * @param {RunTask[]} tasks - Tasks whose field values supply the substitutions
 * @returns {string} The text with resolvable variables substituted inline
 */
export function resolveFieldVariables(text, tasks) {
  if (!text) return text;

  // Map each field label to the first non-empty value answered for it.
  const valueByLabel = {};
  (tasks || []).forEach((task) => {
    (task.fields || []).forEach((field) => {
      const value = task.values ? task.values[field.id] : undefined;
      if (value === undefined || value === null || value === "") return;
      if (valueByLabel[field.label] === undefined) valueByLabel[field.label] = value;
    });
  });

  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, label) => {
    const value = valueByLabel[label];
    return value === undefined ? match : String(value);
  });
}

/**
 * Replaces {{key}} tokens in a string using a resolved {key: value} variable
 * map. Tokens whose key is not present in the map are left untouched, so the
 * caller can spot unfilled placeholders.
 *
 * @param {string} text - Text possibly containing {{key}} tokens
 * @param {Object} variables - A {key: value} map of resolved variable values
 * @returns {string} The text with known variables substituted inline
 */
export function interpolateVariables(text, variables) {
  if (!text) return text;
  const resolve = (match, key) => {
    const value = variables ? variables[key] : undefined;
    return value === undefined || value === null ? match : String(value);
  };
  // Resolve {{ key }} first (double braces are fully consumed, leaving no braces
  // behind), then { key } — so the HOD can write either. An unknown key is left
  // exactly as typed, so stray single braces in ordinary text are never mangled.
  return text
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, resolve)
    .replace(/\{\s*([^{}]+?)\s*\}/g, resolve);
}

/**
 * Merges a template's variable defaults with the values supplied for a run,
 * producing a flat {key: value} map. Supplied values override defaults; any
 * variable without a supplied value falls back to its defaultValue.
 *
 * @param {Template} template - The template whose variables to resolve
 * @param {Object} [variableValues] - Supplied {key: value} overrides
 * @returns {Object} A {key: value} map of resolved variable values
 */
export function resolveVariables(template, variableValues = {}) {
  const resolved = {};
  (template.variables || []).forEach((variable) => {
    const supplied = variableValues[variable.key];
    resolved[variable.key] = supplied ?? variable.defaultValue ?? "";
  });
  return resolved;
}

/**
 * Creates a Run (instance) from a Template.
 * This generates concrete tasks with computed due dates for a specific event at a specific branch.
 * All conditions are evaluated before returning, so tasks have their active state set correctly.
 * Currently only handles type: "relative" dueRules; fixed dates are supported but not tested.
 *
 * @param {Template} template - The template to instantiate
 * @param {string} startDate - ISO date string (YYYY-MM-DD) for the event date
 * @param {Object} branch - The branch object (e.g., { name: "...", short: "...", pic: "...", region: "..." })
 * @returns {Run} A new Run object ready to be saved and tracked
 */
export function createRunFromTemplate(template, startDate, branch, variableValues = {}) {
  const runId = "run-" + Date.now();

  // Resolve the template's variables once, then interpolate every task's title
  // and description against them so {{key}} placeholders are filled at creation.
  const variables = resolveVariables(template, variableValues);

  const tasks = template.steps.map((step) => {
    const taskId = `${runId}-${step.id}`;

    // Compute due date from dueRule
    let dueDate;
    let taskStartDate = null;
    if (step.dueRule.type === "relative") {
      const d = computeDueDate(startDate, step.dueRule.weeksFromStart);
      // Snap to the Friday of that Sat–Fri week: a Saturday rolls to the next
      // Friday, any other day advances to the nearest upcoming Friday.
      const daysUntilFriday = (5 - d.getUTCDay() + 7) % 7;
      d.setUTCDate(d.getUTCDate() + daysUntilFriday);
      dueDate = d.toISOString().slice(0, 10);
      // Task's own week starts on the Saturday before its Friday due date.
      const sat = new Date(d);
      sat.setUTCDate(sat.getUTCDate() - 6);
      taskStartDate = sat.toISOString().slice(0, 10);
    } else if (step.dueRule.type === "fixed") {
      dueDate = step.dueRule.date;
    }

    return {
      id: taskId,
      stepId: step.id,
      stepType: step.stepType ?? "task",
      title: interpolateVariables(step.title, variables),
      description: interpolateVariables(step.description, variables),
      dept: step.dept,
      dependsOn: step.dependsOn.map(depId => `${runId}-${depId}`),
      dueDate,
      startDate: taskStartDate,
      status: "standing-by",
      assignee: null,
      values: {},
      subtasks: (step.subtasks ?? []).map((st) => ({ id: st.id, title: st.title, done: false })),
      active: true, // Will be set correctly by evaluateConditions
    };
  });

  const run = {
    id: runId,
    templateId: template.id,
    branch,
    startDate,
    variables,
    tasks,
  };

  return evaluateConditions(run, template);
}

/**
 * First-draft showcase mastertracker template.
 * Represents a standard workflow for mall showcase events, T-6 weeks through T+1 week.
 * This is a template definition; actual runs will be instances generated from this template.
 * @type {Template}
 */
export const showcaseTemplate = {
  id: "showcase-template",
  name: "Showcase Mastertracker",
  description: "Standard workflow for mall showcase events, counting down T-6 weeks to T+1 week",
  variables: [],
  steps: [
    {
      id: "s1",
      title: "Venue Confirmed Details",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 0 },
      fields: [
        { id: "s1-f1", label: "Showcase Name", type: "text", options: [] },
        { id: "s1-f2", label: "Venue Email", type: "text", options: [] },
        { id: "s1-f3", label: "PIC Venue Name (Mrs./Mr)", type: "text", options: [] },
        { id: "s1-f4", label: "PIC Venue Contact Number", type: "text", options: [] },
        { id: "s1-f5", label: "Showcase Confirmed Date", type: "date", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: [],
    },
    {
      id: "s2",
      title: "Minus Week 12 (Guideline Approval)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [
        { id: "s2-f1", label: "Name", type: "text", options: [] },
        { id: "s2-f2", label: "Dear Ms Athirah", type: "long_text", options: [] },
        { id: "s2-f3", label: "Editable PDF Link", type: "text", options: [] },
        { id: "s2-f4", label: "From", type: "text", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s1"],
    },
    {
      id: "s3",
      title: "Approval: Guideline",
      description: "",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "s2",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s2"],
    },
    {
      id: "s4",
      title: "Minus Week 12 (Ms. Fazween's Approval)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [
        { id: "s4-f1", label: "Dear Ms. Fazween", type: "long_text", options: [], required: true },
        { id: "s4-f2", label: "Attached Poster", type: "file", options: [], required: true },
        { id: "s4-f3", label: "Attached Roll-up Banner", type: "file", options: [], required: true },
        { id: "s4-f4", label: "Attached Guideline (Approved by Ms. Athirah)", type: "file", options: [], required: true },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s3"],
    },
    {
      id: "s5",
      title: "Approval: Ms. Fazween",
      description: "",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "s4",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s4"],
    },
    {
      id: "s6",
      title: "Approval: Mr. Kevin",
      description: "",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "s7",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s5"],
    },
    {
      id: "s7",
      title: "Minus Week 12 (Mr. Kevin's Approval)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [
        { id: "s7-f1", label: "Hello Mr. Kevin", type: "long_text", options: [], required: true },
        { id: "s7-f2", label: "Finalised Poster", type: "file", options: [], required: true },
        { id: "s7-f3", label: "Finalised Roll-up Banner", type: "file", options: [], required: true },
        { id: "s7-f4", label: "Finalised Guideline (Approved by Ms. Athirah & Ms. Fazween)", type: "file", options: [], required: true },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s6"],
    },
    {
      id: "s8",
      title: "Minus Week 12",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -12 },
      fields: [],
      subtasks: [
        { id: "s8-st1", title: "Get approval for Showcase Guideline from Ms. Athirah" },
        { id: "s8-st2", title: "Get approval for Showcase Guideline from Ms. Fazween" },
        { id: "s8-st3", title: "Get approval for Showcase Poster from Ms. Fazween" },
        { id: "s8-st4", title: "Get approval for Showcase Poster from Mr. Kevin" },
        { id: "s8-st5", title: "Get approval for Showcase Roll-Up Banner from Ms. Fazween" },
        { id: "s8-st6", title: "Get approval for Showcase Roll-Up Banner from Mr. Kevin" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s7"],
    },
    {
      id: "s9",
      title: "Minus Week 8",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -8 },
      fields: [
        { id: "s9-f1", label: "Proof of Message Template Approval", type: "file", options: [] },
      ],
      subtasks: [
        { id: "s9-st1", title: "Conduct weekly meeting with HOD for Weekly Update" },
        { id: "s9-st2", title: "Create showcase folder in Google Drive" },
        { id: "s9-st3", title: "Update list of participants who agreed to join" },
        { id: "s9-st4", title: "Create WhatsApp groups — one per time slot" },
        { id: "s9-st5", title: "Print showcase posters for all branches" },
        { id: "s9-st6", title: "Collect proof photos from BMs (Avengers)" },
        { id: "s9-st7", title: "Get message template approved before blasting invitation" },
        { id: "s9-st8", title: "Stock count inventory (medals, badges, sashes, microphone, coloring etc.)" },
        { id: "s9-st9", title: "Send picture of latest inventory count to Marketing WA Group" },
        { id: "s9-st10", title: "Update inventory count in Ebright Portal" },
        { id: "s9-st11", title: "Send list of showcase items to be ordered in Marketing WA Group" },
        { id: "s9-st12", title: "Get approval for ordering item from Ms. Fazween" },
        { id: "s9-st13", title: "Send proof of ordered details in Marketing WA Group" },
        { id: "s9-st14", title: "Order roll-up banner" },
        { id: "sub-mw8-1", title: "Buy chocolates Ferrero Rocher social media awareness" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s8"],
    },
    {
      id: "s10",
      title: "Minus Week 8 (Order Items Approval)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -8 },
      fields: [
        { id: "s10-f1", label: "Hello Ms Fazween", type: "long_text", options: [] },
        { id: "s10-f2", label: "Items To Order", type: "long_text", options: [] },
        { id: "s10-f3", label: "Screenshot of Latest Inventory (Portal)", type: "file", options: [] },
        { id: "s10-f4", label: "Screenshot of Item Quotation", type: "file", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s9"],
    },
    {
      id: "s11",
      title: "Approval: Order Items",
      description: "",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "s10",
      dueRule: { type: "relative", weeksFromStart: -8 },
      fields: [],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s10"],
    },
    {
      id: "s12",
      title: "Minus Week 7",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -7 },
      fields: [],
      subtasks: [
        { id: "s12-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s12-st2", title: "Showcase item ordered?" },
        { id: "s12-st3", title: "Remind BM to update confirmed student in FA Portal (Avengers)" },
        { id: "s12-st4", title: "Add agreed participants in WA Group according to their time slots" },
        { id: "s12-st5", title: "Update the status of ordered items in Marketing WA Group" },
        { id: "s12-st6", title: "Update the number of participants joining in Marketing WA Group" },
        { id: "s12-st7", title: "Update the pictures of branches with showcase posters up in Marketing WA Group" },
        { id: "s12-st8", title: "QAQC BMs for branch invitation" },
        { id: "sub-mw7-1", title: "Assign a PIC to host for the online practice session" },
        { id: "sub-mw7-2", title: "Create Calendly link for online practice session" },
        { id: "sub-mw7-3", title: "Send Calendly link in parents WA group" },
        { id: "sub-mw7-4", title: "Host the online practice session" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s11"],
    },
    {
      id: "s13",
      title: "Minus Week 6",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -6 },
      fields: [],
      subtasks: [
        { id: "s13-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s13-st2", title: "Makesure checklist from week 8, 7, 6 is done" },
        { id: "s13-st3", title: "Remind BM to update confirmed student in FA Portal (Avengers)" },
        { id: "s13-st4", title: "Update the number of participants confirmed joining showcase in Marketing WA Group" },
        { id: "s13-st5", title: "Add agreed participants in WA group according to their time slots" },
        { id: "s13-st6", title: "Update status for all ordered items in Marketing WA Group" },
        { id: "s13-st7", title: "Update the pictures of branches with showcase posters up in Marketing WA Group" },
        { id: "s13-st8", title: "Get B&W confirmation for coaches in online practice session" },
        { id: "s13-st9", title: "Create practice session schedule" },
        { id: "s13-st10", title: "Send practice session schedule in Marketing WA Group (get approval from HOD)" },
        { id: "s13-st11", title: "Update the status for rollup banner order (Arrived already?)" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s12"],
    },
    {
      id: "s14",
      title: "Minus Week 5",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -5 },
      fields: [],
      subtasks: [
        { id: "s14-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s14-st2", title: "Remind BM to update confirmed student in FA Portal (Avengers)" },
        { id: "s14-st3", title: "Send reminder for BM/FT/Coach to record the practice session at branch" },
        { id: "s14-st4", title: "Add agreed participants in WA group according to their time slots" },
        { id: "s14-st5", title: "Update status for all ordered items in Marketing WA Group" },
        { id: "s14-st6", title: "Update the number of participants confirmed joining showcase in Marketing WA Group" },
        { id: "s14-st7", title: "Update the pictures of branches with showcase posters up in Marketing WA Group" },
        { id: "s14-st8", title: "Create Calendly link for practice session" },
        { id: "s14-st9", title: "Send Calendly link in parents WA Group" },
        { id: "s14-st10", title: "Assign a PIC to host for the practice session" },
        { id: "s14-st11", title: "Host the online practice session" },
        { id: "s14-st12", title: "Add HOD and MD in parents WA group" },
        { id: "s14-st13", title: "Update the status for rollup banner order (Arrived already?)" },
        { id: "s14-st14", title: "Send the updated emcee script for approval in Marketing WA Group" },
        { id: "s14-st15", title: "Start the tasks in following month's showcase" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s13"],
    },
    {
      id: "s15",
      title: "Minus Week 4",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -4 },
      fields: [],
      subtasks: [
        { id: "s15-st1", title: "Send showcase guideline link to all manpower" },
        { id: "s15-st2", title: "Hold a kickoff meeting for all the roles involved" },
        { id: "s15-st3", title: "Adult Emcee script reading video received" },
        { id: "s15-st4", title: "Create a Whatsapp group for manpower" },
        { id: "s15-st5", title: "All manpower download BUZZ" },
        { id: "s15-st6", title: "Send design to Venue for confirmation" },
        { id: "s15-st7", title: "Detailed program flow with timing (tentative)" },
        { id: "s15-st8", title: "Create content writing for posting on" },
        { id: "s15-st9", title: "Create a Whatsapp Group for Student and Adult Emcee" },
        { id: "s15-st10", title: "Create FB Event" },
        { id: "s15-st11", title: "FB Shoutout: Promotion content" },
        { id: "s15-st12", title: "Whatsapps channel: Promotion content" },
        { id: "s15-st13", title: "Instagram: Promotion content" },
        { id: "s15-st14", title: "Ensure all branches has displayed poster on notice board" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s14"],
    },
    {
      id: "s16",
      title: "Minus Week 4 (Manpower Form)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -4 },
      fields: [
        { id: "s16-f1", label: "Organising Chairperson, Floor Manager", type: "text", options: [] },
        { id: "s16-f2", label: "Organising Chairperson Email", type: "text", options: [] },
        { id: "s16-f3", label: "Registration Booth", type: "text", options: [] },
        { id: "s16-f4", label: "Adult Emcee(s)", type: "text", options: [] },
        { id: "s16-f5", label: "Student Emcee(s)", type: "text", options: [] },
        { id: "s16-f6", label: "Stage Usher, Sashes", type: "text", options: [] },
        { id: "s16-f7", label: "Certificate, Medal", type: "text", options: [] },
        { id: "s16-f8", label: "Mascot", type: "text", options: [] },
        { id: "s16-f9", label: "Photographer, Videographer", type: "text", options: [] },
        { id: "s16-f10", label: "POS Booth", type: "text", options: [] },
        { id: "s16-f11", label: "Google Review Booth", type: "text", options: [] },
        { id: "s16-f12", label: "Helper, Social Media Manager", type: "text", options: [] },
        { id: "s16-f13", label: "Coach (During practice session)", type: "text", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s15"],
    },
    {
      id: "s17",
      title: "Minus Week 4 (Manpower Rate)",
      description: "Complete all manpower checklist before proceeding. Ensure all proofs are uploaded and all items are confirmed before marking this task as done.",
      dueRule: { type: "relative", weeksFromStart: -4 },
      fields: [
        { id: "s17-f1", label: "Proof of Emcee Approval", type: "file", options: [] },
        { id: "s17-f2", label: "Proof of Emcee Rate Sent (If Any)", type: "file", options: [] },
        { id: "s17-f3", label: "Proof of Helper Rate Sent (If Any)", type: "file", options: [] },
        { id: "s17-f4", label: "Proof of Incentive Rate Sent (If Any)", type: "file", options: [] },
      ],
      subtasks: [
        { id: "s17-sub-1", title: "Arrange emcee meet-up with HOD for approval" },
        { id: "s17-sub-2", title: "Upload HOD approval proof for adult emcee (Intern)" },
        { id: "s17-sub-3", title: "Send incentive rate to POS Booth (External)" },
        { id: "s17-sub-4", title: "Send emcee rate to Adult Emcee (External)" },
        { id: "s17-sub-5", title: "Send helper rate to Helper/Faci/PIC (External)" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s16"],
    },
    {
      id: "s18",
      title: "Minus Week 4 (Poster Proof)",
      description: "Upload picture of all branches displaying the Showcase Poster on the branch's notice board.",
      dueRule: { type: "relative", weeksFromStart: -4 },
      fields: [
        { id: "s18-f1", label: "Subang Taipan (ST)", type: "file", options: [] },
        { id: "s18-f2", label: "Setia Alam (SA)", type: "file", options: [] },
        { id: "s18-f3", label: "Sri Petaling (SP)", type: "file", options: [] },
        { id: "s18-f4", label: "Kota Damansara (KD)", type: "file", options: [] },
        { id: "s18-f5", label: "Putrajaya (PJY)", type: "file", options: [] },
        { id: "s18-f6", label: "Ampang (AMP)", type: "file", options: [] },
        { id: "s18-f7", label: "Cyberjaya (CJY)", type: "file", options: [] },
        { id: "s18-f8", label: "Klang (KLG)", type: "file", options: [] },
        { id: "s18-f9", label: "Denai Alam (DA)", type: "file", options: [] },
        { id: "s18-f10", label: "Bandar Baru Bangi (BBB)", type: "file", options: [] },
        { id: "s18-f11", label: "Danau Kota (DK)", type: "file", options: [] },
        { id: "s18-f12", label: "Shah Alam (SHA)", type: "file", options: [] },
        { id: "s18-f13", label: "Bandar Tun Hussein Onn (BTHO)", type: "file", options: [] },
        { id: "s18-f14", label: "Eco Grandeur (EGR)", type: "file", options: [] },
        { id: "s18-f15", label: "Bandar Sri Putra (BSP)", type: "file", options: [] },
        { id: "s18-f16", label: "Rimbayu (RBY)", type: "file", options: [] },
        { id: "s18-f17", label: "Taman Sri Gombak (TSG)", type: "file", options: [] },
        { id: "s18-f18", label: "Kota Warisan (KW)", type: "file", options: [] },
        { id: "s18-f19", label: "Kajang TTDI Grove (KTG)", type: "file", options: [] },
        { id: "s18-f20", label: "Tropicana Sungai Buloh (TSB)", type: "file", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s17"],
    },
    {
      id: "s19",
      title: "Minus Week 3",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -3 },
      fields: [
        { id: "s19-f1", label: "Proof of RM A Invitation", type: "file", options: [], required: true },
        { id: "s19-f2", label: "Proof of RM B Invitation", type: "file", options: [], required: true },
        { id: "s19-f3", label: "Proof of RM C Invitation", type: "file", options: [], required: true },
      ],
      subtasks: [
        { id: "s19-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s19-st2", title: "Remind BM its the final week to invite and get confirmation from parents" },
        { id: "s19-st3", title: "Send reminder for BM/FT/Coach to record the practice session at branch" },
        { id: "s19-st4", title: "Create Calendly link for practice session" },
        { id: "s19-st5", title: "Send Calendly link in parents WA group" },
        { id: "s19-st6", title: "Host the online practice session/assign a PIC to host" },
        { id: "s19-st7", title: "Ensure that we only need to Set-Up during the same day" },
        { id: "s19-st8", title: "Finalize list of participants who agree to join the monthly showcase" },
        { id: "s19-st9", title: "Add agreed participants in WA group according to their time slots" },
        { id: "s19-st10", title: "Update status for all ordered items in Marketing WA Group" },
        { id: "s19-st11", title: "Update the number of participants confirmed joining showcase in Marketing WA Group" },
        { id: "s19-st12", title: "Text celebrity ambassadors to invite them for the showcase" },
        { id: "s19-st13", title: "Schedule student emcees training (1 hour with the Adult Emcees)" },
        { id: "s19-st14", title: "Schedule manpower meeting, everyone must attend physically at the center" },
        { id: "s19-st15", title: "Schedule a parents briefing session" },
        { id: "s19-st16", title: "Buy chocolates Ferrero Rocher for social media awareness" },
        { id: "s19-st17", title: "Physical visit to actual venue to make sure things are okay" },
        { id: "s19-st18", title: "OC: Visit the venue and take a picture/video setting" },
        { id: "s19-st19", title: "Appoint someone to display live Zoom at HQ main area" },
        { id: "s19-st20", title: "Record a video on how to get there" },
        { id: "s19-st21", title: "Send invitation to all RM via Whatsapp" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s18"],
    },
    {
      id: "s20",
      title: "Minus Week 2",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -2 },
      fields: [],
      subtasks: [
        { id: "s20-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s20-st2", title: "Set up a 15-minute meeting with Mr. Kevin to update master tracker" },
        { id: "s20-st3", title: "Finalize participants name list and send by session in parents WA group" },
        { id: "s20-st4", title: "Send number of participants per grade for the showcase" },
        { id: "s20-st5", title: "Get confirmation of participants full name for certificate printing" },
        { id: "s20-st6", title: "Update participants and sponsors list and add confirmed participants to WA group by time slot" },
        { id: "s20-st7", title: "Make sure 200 students list attendance is ticked" },
        { id: "s20-st8", title: "Send the confirmed participants names for each branches by slot to be confirmed in the branch group" },
        { id: "s20-st9", title: "Print certificates for participants, student emcees and venues" },
        { id: "s20-st10", title: "Take picture of medals and stock count — send to marketing WA group and tag HOD" },
        { id: "s20-st11", title: "Bring the printed cert and participant name list to HOD to be checked" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s19"],
    },
    {
      id: "s21",
      title: "Minus Week 2 (Participant List and Certificates)",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -2 },
      fields: [
        { id: "s21-f1", label: "Link For Certificates (Canva)", type: "text", options: [] },
        { id: "s21-f2", label: "Link for Participant List (Spreadsheet)", type: "text", options: [] },
      ],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s20"],
    },
    {
      id: "s22",
      title: "Approval: Participant List & Certificates",
      description: "Hi Mr Kevin and Ms Fazween, these are Participant List and Certificates. Please review this and do inform us if there any changes.",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "s21",
      dueRule: { type: "relative", weeksFromStart: -2 },
      fields: [],
      subtasks: [],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s21"],
    },
    {
      id: "s23",
      title: "Minus Days 7",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -1 },
      fields: [],
      subtasks: [
        { id: "s23-st1", title: "Conduct weekly meeting with HOD" },
        { id: "s23-st2", title: "Create calendly link for practice session" },
        { id: "s23-st3", title: "Send calendly link in parents WA group" },
        { id: "s23-st4", title: "Host the online practice session/assign a PIC to host for the practice session" },
        { id: "s23-st5", title: "Make sure PA system is complete, mic stand is available" },
        { id: "s23-st6", title: "Foundation Appraisal: Housekeeping and Reminder to participants" },
        { id: "s23-st7", title: "Foundation Appraisal: Update the latest list of confirmed FA students" },
        { id: "s23-st8", title: "Get confirmation from POS (Parents Outreach Squad) team to be on duty for sales booth" },
        { id: "s23-st9", title: "Go through the celebrity ambassador/testimonial SOP and prepare the items as specified" },
        { id: "s23-st10", title: "Aone: Create replacement request for Foundation Appraisal participants" },
        { id: "s23-st11", title: "Make sure the attendances in Aone are pre-ticked and send screenshots to marketing WA group" },
        { id: "s23-st12", title: "Create google drive folder for each sessions to upload pictures on showcase day" },
        { id: "s23-st13", title: "Remind appointed someone to display live Zoom at HQ main area" },
        { id: "s23-st14", title: "Make awareness posting - social media posting for EB awareness" },
        { id: "s23-st15", title: "Instagram Repost Poster" },
        { id: "s23-st16", title: "FB Repost Poster" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s22"],
    },
    {
      id: "s24",
      title: "Minus Days 4",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 0 },
      fields: [
        { id: "s24-f1", label: "Upload proof of HOD approval for parents engagement slides", type: "file", options: [] },
        { id: "s24-f2", label: "Upload proof of Zoom display at HQ main area", type: "file", options: [] },
        { id: "s24-f3", label: "Upload proof of printed Google Review QR code", type: "file", options: [] },
      ],
      subtasks: [
        { id: "s24-st1", title: "Conduct weekly meeting" },
        { id: "s24-st2", title: "Brief team on venue layout, arrangement and setup" },
        { id: "s24-st3", title: "Pack and prepare all items" },
        { id: "s24-st4", title: "Print all event materials — certificates, participants list and tentative" },
        { id: "s24-st5", title: "Print venue sponsor certificate with cert holder" },
        { id: "s24-st6", title: "Print all required materials (forms, etc.)" },
        { id: "s24-st7", title: "Prepare background songs playlist" },
        { id: "s24-st8", title: "Ensure marketing phone has 4G connection" },
        { id: "s24-st9", title: "Ensure sufficient storage on devices for photos and videos" },
        { id: "s24-st10", title: "Print Google Review QR code for all branches" },
        { id: "s24-st11", title: "Send Google & Facebook review target number and tag POS PIC in showcase group" },
        { id: "s24-st12", title: "Brief OC and POS PIC on Google & Facebook review process" },
        { id: "s24-st13", title: "Set up Aone — create replacement request and ensure attendances are pre-ticked" },
        { id: "s24-st14", title: "Update parents engagement slides — share link and tag HOD for approval" },
        { id: "s24-st15", title: "Remind appointed person to display live Zoom at HQ main area" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s23"],
    },
    {
      id: "s25",
      title: "Item Checklist",
      optionalCompletion: true,
      description: "",
      dueRule: { type: "relative", weeksFromStart: 0 },
      fields: [],
      subtasks: [
        { id: "s25-st1", title: "Portable wifi" },
        { id: "s25-st2", title: "Send Sample Banner to Sponsors" },
        { id: "s25-st3", title: "Portable TV" },
        { id: "s25-st4", title: "Portable PA System - Background Music" },
        { id: "s25-st5", title: "Portable PA System - Mic Purpose" },
        { id: "s25-st6", title: "Portable MIC" },
        { id: "s25-st7", title: "Test PA system whether its working or not" },
        { id: "s25-st8", title: "Replace new Battery for MIC" },
        { id: "s25-st9", title: "Ebright Backdrop" },
        { id: "s25-st10", title: "Sponsors Roll-up Banner" },
        { id: "s25-st11", title: "Ebright Roll-up Banner (The Red One with Only Logo)" },
        { id: "s25-st12", title: "Extension Wire" },
        { id: "s25-st13", title: "Tape to protect extension wire" },
        { id: "s25-st14", title: "Printed Qucsheet" },
        { id: "s25-st15", title: "Table Clothes" },
        { id: "s25-st16", title: "Event Organizer Script" },
        { id: "s25-st17", title: "List of songs during waiting period" },
        { id: "s25-st18", title: "MIC Status whether functioning" },
        { id: "s25-st19", title: "Mic Stand" },
        { id: "s25-st20", title: "Ebright Logo Mic" },
        { id: "s25-st21", title: "Bring Camera" },
        { id: "s25-st22", title: "Ebright vest" },
        { id: "s25-st23", title: "Big white Transparent Box" },
        { id: "s25-st24", title: "Microphone Cover (Health purpose)" },
        { id: "s25-st25", title: "Projector" },
        { id: "s25-st26", title: "Projector White Screen" },
        { id: "s25-st27", title: "360 camera" },
        { id: "s25-st28", title: "Blower (welcome)" },
        { id: "s25-st29", title: "POS booth" },
        { id: "s25-st30", title: "Bebe Boo (Ebright standee)" },
        { id: "s25-st31", title: "Backdrop" },
        { id: "s25-st32", title: "Barricade" },
        { id: "s25-st33", title: "Certificate for Sponsors" },
        { id: "s25-st34", title: "Table to place trophies and certificates" },
        { id: "s25-st35", title: "Certificates for Participants" },
        { id: "s25-st36", title: "Empty Certificates for extra participants" },
        { id: "s25-st37", title: "Sales booth" },
        { id: "s25-st38", title: "Kids table for colouring" },
        { id: "s25-st39", title: "Ebright brochures" },
        { id: "s25-st40", title: "Balloons" },
        { id: "s25-st41", title: "Balloon sticks" },
        { id: "s25-st42", title: "Mini Logos" },
        { id: "s25-st43", title: "TV controller" },
        { id: "s25-st44", title: "Pendrive with showcase video" },
        { id: "s25-st45", title: "Pendrive with talkshow video" },
        { id: "s25-st46", title: "Projector Screen" },
        { id: "s25-st47", title: "Ebright Vest" },
        { id: "s25-st48", title: "Extension Plug" },
        { id: "s25-st49", title: "Pens for staff" },
        { id: "s25-st50", title: "GHL Machine" },
        { id: "s25-st51", title: "Portable wifi (must connect with the blue laptop)" },
        { id: "s25-st52", title: "Wide angle webcam" },
        { id: "s25-st53", title: "Kids table (round blue table)" },
        { id: "s25-st54", title: "Kids chairs" },
        { id: "s25-st55", title: "Colour pencils" },
        { id: "s25-st56", title: "Straw builder game" },
        { id: "s25-st57", title: "Portable PA system" },
        { id: "s25-st58", title: "Wireless mic (must be tested before roadshow)" },
        { id: "s25-st59", title: "AA batteries for mic" },
        { id: "s25-st60", title: "AAA batteries for remote control" },
        { id: "s25-st61", title: "Mic sleeve with Ebright logo" },
        { id: "s25-st62", title: "Mini stage" },
        { id: "s25-st63", title: "Phone stand" },
        { id: "s25-st64", title: "Thermal printer" },
        { id: "s25-st65", title: "Thermal printer paper" },
        { id: "s25-st66", title: "Ebright curriculum chart" },
        { id: "s25-st67", title: "Ebright branches foamboard" },
        { id: "s25-st68", title: "Ebright branches foamboard stand" },
        { id: "s25-st69", title: "Ebright class timing catalogue" },
        { id: "s25-st70", title: "Wheel of fortune" },
        { id: "s25-st71", title: "Ball Pit" },
        { id: "s25-st72", title: "Balls (for ball pit)" },
        { id: "s25-st73", title: "Carpet" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s24"],
    },
    {
      id: "s26",
      title: "Minus Day 1",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 0 },
      fields: [],
      subtasks: [
        { id: "s26-st1", title: "All manpower must be present at HQ for packing" },
        { id: "s26-st2", title: "Send Reminder (in WS Group) to Parents" },
        { id: "s26-st3", title: "Send Schedule to Parents" },
        { id: "s26-st4", title: "Send Reminder to parents about attire, location and meet up time" },
        { id: "s26-st5", title: "Send Reminder to Ebrighters and staff about attire, location and meet up time" },
        { id: "s26-st6", title: "Send reminder to Lalamove uncle" },
        { id: "s26-st7", title: "Meet HOD for final updates" },
        { id: "s26-st8", title: "Check the certificate name, whether its correct or not" },
        { id: "s26-st9", title: "Bring back marketing phone to answer last min inquiries" },
        { id: "s26-st10", title: "Charge our marketing phone" },
        { id: "s26-st11", title: "Soc Mod - Final shoutout on social media platform" },
        { id: "s26-st12", title: "Soc Mod - Share address & venue" },
        { id: "s26-st13", title: "Send EXACT meet up location in that venue" },
        { id: "s26-st14", title: "Send reminder to committee to wear professionally, No Caps" },
        { id: "s26-st15", title: "Give company a miss call via normal line" },
        { id: "s26-st16", title: "Give company a miss call via whatsapp call" },
        { id: "s26-st17", title: "Appoint food crew PIC" },
        { id: "s26-st18", title: "Every manpower need to install BUZ app" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s25"],
    },
    {
      id: "s27",
      title: "Actual Day",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 1 },
      fields: [],
      subtasks: [
        { id: "s27-st1", title: "OC: Set up zoom and use zoom to communicate" },
        { id: "s27-st2", title: "OC: Set up one laptop at each station (POS Booth, Registration booth, Medals table)" },
        { id: "s27-st3", title: "2 Hour before Event: Send another reminder to parents" },
        { id: "s27-st4", title: "Assign 1 PIC to do 3 stories per session during showcase" },
        { id: "s27-st5", title: "POS: update leads number every hour in manpower group" },
        { id: "s27-st6", title: "Take a picture of the showcase setup and send in group" },
        { id: "s27-st7", title: "Setup Instagram booth, take picture and send in the group" },
        { id: "s27-st8", title: "Before setup: Assign tasks to each committee member" },
        { id: "s27-st9", title: "15 mins before Event: Politely reject any parents who sent their child earlier" },
        { id: "s27-st10", title: "Do full rehearsal, refer to the rehearsal checklist" },
        { id: "s27-st11", title: "Photographer & Videographer: Do not stand in the middle and block the views" },
        { id: "s27-st12", title: "Briefing & Goal setting for POS team" },
        { id: "s27-st13", title: "Dont allow students to come in before the actual time" },
        { id: "s27-st14", title: "Ask appointed PIC to send picture of live zoom at HQ main Area" },
        { id: "s27-st15", title: "Wear ebright vest" },
        { id: "s27-st16", title: "Final test for PA system" },
        { id: "s27-st17", title: "Breakfast for Ebrighters" },
        { id: "s27-st18", title: "Upload photos of students according to their sessions" },
        { id: "s27-st19", title: "Capture video" },
        { id: "s27-st20", title: "Capture photos" },
        { id: "s27-st21", title: "Take group photos" },
        { id: "s27-st22", title: "Take individual family photos" },
        { id: "s27-st23", title: "Tally all the attendance with number of participants" },
        { id: "s27-st24", title: "Aone: Tick students attendance in Aone" },
        { id: "s27-st25", title: "Add replacement students for Foundation Appraisal" },
        { id: "s27-st26", title: "Upload photos of students according to their sessions" },
        { id: "s27-st27", title: "Online form to give feedback" },
        { id: "s27-st28", title: "Stay back after the event to mark attendance and upload videos" },
        { id: "s27-st29", title: "Ask for FB / Google reviews" },
        { id: "s27-st30", title: "2 Hour after Event: Thank parents via Whatsapp" },
        { id: "s27-st31", title: "Return all items properly at HQ with picture proof" },
        { id: "s27-st32", title: "Get all photos and videos from photographer" },
        { id: "s27-st33", title: "Create an album with the title YYMMDD Month Showcase" },
        { id: "s27-st34", title: "Upload all youtube video to ebrightcoach@gmail.com" },
        { id: "s27-st35", title: "Upload group photos on FB and IG" },
        { id: "s27-st36", title: "Post: Event on featured FB posts" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s26"],
    },
    {
      id: "s28",
      title: "Plus 1 Week",
      optionalCompletion: true,
      description: "",
      dueRule: { type: "relative", weeksFromStart: 1 },
      fields: [],
      subtasks: [
        { id: "s28-st1", title: "Conduct event post mortem" },
        { id: "s28-st2", title: "Check feedback form and send screenshot to Marketing WA group" },
        { id: "s28-st3", title: "Send suggested changes on Tracker based on post mortem" },
        { id: "s28-st4", title: "Add new SOP/Procedures into master tracker upon completing post mortem" },
        { id: "s28-st5", title: "Finalise the actual budget and present in post mortem meeting" },
        { id: "s28-st6", title: "Re-order Certificate (Amendment)" },
        { id: "s28-st7", title: "Send Video link for student video in Announcement channel & Avenger group" },
        { id: "s28-st8", title: "Send Video link to FT Coach group for evaluation" },
        { id: "s28-st9", title: "Distribute the amended certificate to the BMs" },
        { id: "s28-st10", title: "Thanks all the sponsors via whatsapps" },
        { id: "s28-st11", title: "Send email to all sponsors together with group photo" },
        { id: "s28-st12", title: "Deposit refund from Venue Sponsor" },
        { id: "s28-st13", title: "Send parents the google drive link for their session photos" },
        { id: "s28-st14", title: "Send the youtube video to the parents in parents group" },
        { id: "s28-st15", title: "Ask parents to retrieve photo on the given googledrive link" },
        { id: "s28-st16", title: "Upload Foundation Appraisal videos in Aone (Chapter 12)" },
        { id: "s28-st17", title: "Take out showcase posters from all BMs, send pictures as proof" },
        { id: "s28-st18", title: "Send screenshot of attendance ticked for Foundation Appraisal students" },
        { id: "s28-st19", title: "POS: Update Number of leads contacted in Marketing WA group" },
        { id: "s28-st20", title: "Get MD/HOD to glance thru all FA student attendance in Aone" },
        { id: "s28-st21", title: "Post event photo album on FB" },
        { id: "s28-st22", title: "Email: Thanks sponsor with photo" },
        { id: "s28-st23", title: "Remove Flyer from Subang Ground Floor Acrylic notice board" },
        { id: "s28-st24", title: "Post: Event on featured FB posts" },
        { id: "s28-st25", title: "OC must fill in the claim form request (for part timers and interns)" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s27"],
    },
    {
      id: "s29",
      title: "Plus 2 Week",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 2 },
      fields: [],
      subtasks: [
        { id: "s29-st1", title: "Foundation Appraisal results released to students, BMs send picture as proof that chapter 12 has been added to each students files" },
      ],
      dueDate: "",
      dept: "Marketing",
      dependsOn: ["s28"],
    },
  ],
};

/**
 * Minus Week 15 template — venue scouting and confirmation workflow,
 * starting 15 weeks before event day.
 * @type {Template}
 */
export const minusWeek15Template = {
  id: "minus-week-15",
  name: "Minus Week 15",
  description: "Venue scouting and confirmation workflow, starting 15 weeks before event day.",
  variables: [],
  steps: [
    {
      id: "m1",
      title: "DO NOT TOUCH",
      description: "Click here for the SOP: Showcase Venue Scouting",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: [],
      fields: [
        { id: "m1-f1", label: "Venue Name", type: "text", options: [] },
        { id: "m1-f2", label: "Venue Email", type: "text", options: [] },
        { id: "m1-f3", label: "PIC Venue Name (Mrs./Mr)", type: "text", options: [] },
        { id: "m1-f4", label: "PIC Venue Contact Number", type: "text", options: [] },
      ],
      subtasks: [
        { id: "m1-st1", title: "Contact venues and get their marketing PIC number" },
      ],
      dueDate: "",
    },
    {
      id: "m2",
      title: "Venue Details",
      description: "Venue Name: {{Venue Name}}\nVenue Email: {{Venue Email}}\nPIC Venue Name: {{PIC Venue Name (Mrs./Mr)}}\nPIC Venue Contact Number: {{PIC Venue Contact Number}}",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m1"],
      fields: [],
      subtasks: [],
      dueDate: "",
    },
    {
      id: "m3",
      title: "Send Email to Venue",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m2"],
      fields: [
        { id: "m3-f1", label: "Email To", type: "text", options: [] },
        { id: "m3-f2", label: "CC", type: "text", options: [] },
        { id: "m3-f3", label: "Subject", type: "text", options: [] },
        { id: "m3-f4", label: "Body", type: "long_text", options: [] },
      ],
      subtasks: [
        { id: "m3-st1", title: "Confirm the showcase date with the PIC. If date not set, ask which dates are available" },
      ],
      dueDate: "",
    },
    {
      id: "m4",
      title: "Venue Confirmation",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m3"],
      fields: [
        { id: "m4-f1", label: "Venue confirm?", type: "dropdown", options: ["Yes", "No"] },
        { id: "m4-f2", label: "Proof of confirmation from venue PIC", type: "file", options: [], required: true },
      ],
      subtasks: [],
      dueDate: "",
    },
    {
      id: "m5",
      title: "Event Proposed Confirmed Venue",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m4"],
      fields: [
        { id: "m5-f1", label: "Sponsor Listing", type: "dropdown", options: ["Stage", "Table", "Chair", "Plug Point", "Carpet"] },
        { id: "m5-f2", label: "If Others, Please state", type: "text", options: [] },
        { id: "m5-f3", label: "First-time collaboration?", type: "dropdown", options: ["Yes", "No"] },
        { id: "m5-f4", label: "Provide the venue floorplan here", type: "file", options: [] },
        { id: "m5-f5", label: "Provide showcase layout", type: "file", options: [] },
      ],
      subtasks: [
        { id: "m5-st1", title: "Ask for the floorplan" },
        { id: "m5-st2", title: "Provide the layout" },
        { id: "m5-st3", title: "Secure venue approvals, permits, and necessary paperwork" },
        { id: "m5-st4", title: "Create a tentatives for the showcase according to the venue's timing" },
      ],
      dueDate: "",
    },
    {
      id: "m6",
      title: "Venue Confirmation Email",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m5"],
      fields: [
        { id: "m6-f1", label: "To", type: "text", options: [] },
        { id: "m6-f2", label: "CC", type: "text", options: [] },
        { id: "m6-f3", label: "Subject", type: "text", options: [] },
        { id: "m6-f4", label: "Body", type: "long_text", options: [] },
      ],
      subtasks: [],
      dueDate: "",
    },
    {
      id: "m7",
      title: "Security Deposit Approval Request",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m6"],
      fields: [
        { id: "m7-f1", label: "Greetings", type: "long_text", options: [] },
        { id: "m7-f2", label: "Showcase Name", type: "text", options: [] },
        { id: "m7-f3", label: "Venue Name", type: "text", options: [] },
        { id: "m7-f4", label: "Showcase Confirmed Start Date", type: "text", options: [] },
        { id: "m7-f5", label: "Showcase Confirmed End Date", type: "text", options: [] },
        { id: "m7-f6", label: "Security Deposit (RM)", type: "text", options: [] },
        { id: "m7-f7", label: "Payment Reference", type: "text", options: [] },
        { id: "m7-f8", label: "Attached Payment Reference", type: "file", options: [] },
        { id: "m7-f9", label: "Proof of Venue Confirmed", type: "file", options: [] },
      ],
      subtasks: [],
      dueDate: "",
    },
    {
      id: "m8",
      title: "Approval: Security Deposit",
      description: "",
      stepType: "approval",
      isApproval: true,
      approvesStepId: "m7",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m7"],
      fields: [],
      subtasks: [],
      dueDate: "",
    },
    {
      id: "m9",
      title: "Minus Week 15 Checklist",
      description: "",
      dueRule: { type: "relative", weeksFromStart: -15 },
      dept: "Marketing",
      dependsOn: ["m8"],
      fields: [
        { id: "m9-f1", label: "Proof of security deposit receipt sent to venue PIC", type: "file", options: [], required: true },
      ],
      subtasks: [
        { id: "m9-st1", title: "Follow up venue PIC to get the contract/invoice approved" },
        { id: "m9-st2", title: "Get confirmation from HOD and CEO if the security deposit is approved" },
        { id: "m9-st3", title: "Send the security deposit receipt to the venue PIC (if approved)" },
      ],
      dueDate: "",
    },
  ],
};

export const parentConfirmationTemplate = {
  id: "parent-confirmation",
  name: "Parent Confirmation",
  description: "Collect student and parent details to confirm attendance at the showcase event.",
  variables: [],
  steps: [
    {
      id: "pc1",
      title: "Student Detail and Parents Confirmation",
      description: "",
      dueRule: { type: "relative", weeksFromStart: 0 },
      dept: "Marketing",
      dependsOn: [],
      fields: [
        { id: "pc-f1", label: "Student Full Name as per IC", type: "text", options: [] },
        { id: "pc-f2", label: "Branch", type: "dropdown", options: ["Ampang", "Bandar Baru Bangi", "Bandar Rimbayu", "Bandar Seri Putra", "Bandar Tun Hussein Onn", "Cyberjaya", "Danau Kota", "Dataran Puchong Utama", "Denai Alam", "Desa Sri Hartamas", "Eco Grandeur", "Kajang TTDI Grove", "Klang", "Kota Damansara", "Kota Warisan", "Online", "Putrajaya", "Selayang", "Senawang Taipan", "Seremban", "Setia Alam", "Shah Alam", "Sri Petaling", "Subang Taipan", "Sungai Buloh", "Taman Sri Gombak"] },
        { id: "pc-f3", label: "Grade", type: "text", options: [] },
        { id: "pc-f4", label: "Parent's Name", type: "text", options: [] },
        { id: "pc-f5", label: "Parent's Phone Number", type: "text", options: [] },
        { id: "pc-f6", label: "Attendance Status", type: "dropdown", options: ["Yes, we will attend! 🥳", "No, we are unable to attend. 🥲"] },
      ],
      subtasks: [],
      dueDate: "",
    },
  ],
};
