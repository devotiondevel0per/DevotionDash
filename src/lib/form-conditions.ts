export type FormConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export type FormConditionAction = "show" | "require" | "options";

export type FormFieldCondition = {
  id: string;
  sourceKey: string;
  operator: FormConditionOperator;
  value: string;
  action: FormConditionAction;
  options: string[];
  enabled: boolean;
};

export type ConditionSourceValues = Record<string, unknown>;

export const FORM_CONDITION_OPERATORS: FormConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
];

export const FORM_CONDITION_ACTIONS: FormConditionAction[] = [
  "show",
  "require",
  "options",
];

export function isValidFormConditionOperator(value: unknown): value is FormConditionOperator {
  return FORM_CONDITION_OPERATORS.includes(value as FormConditionOperator);
}

export function isValidFormConditionAction(value: unknown): value is FormConditionAction {
  return FORM_CONDITION_ACTIONS.includes(value as FormConditionAction);
}

export function dedupeConditionOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const value = entry.trim().slice(0, 120);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= 200) break;
  }
  return result;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function collectComparableText(value: unknown, out: string[]) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectComparableText(item, out);
    }
    return;
  }
  if (typeof value === "boolean") {
    out.push(value ? "true" : "false");
    out.push(value ? "yes" : "no");
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(String(value));
    return;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.fileName === "string" && row.fileName.trim()) {
      out.push(row.fileName.trim());
      return;
    }
    return;
  }
  out.push(String(value));
}

function toComparableValues(value: unknown): string[] {
  const items: string[] = [];
  collectComparableText(value, items);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function matchCondition(condition: FormFieldCondition, sourceValue: unknown): boolean {
  if (condition.operator === "is_empty") return isEmptyValue(sourceValue);
  if (condition.operator === "is_not_empty") return !isEmptyValue(sourceValue);

  const target = normalizeText(condition.value);
  if (!target) {
    return condition.operator === "not_contains" || condition.operator === "not_equals";
  }

  const values = toComparableValues(sourceValue);
  if (values.length === 0) {
    return condition.operator === "not_contains" || condition.operator === "not_equals";
  }

  if (condition.operator === "equals") {
    return values.some((entry) => entry === target);
  }
  if (condition.operator === "not_equals") {
    return values.every((entry) => entry !== target);
  }
  if (condition.operator === "contains") {
    return values.some((entry) => entry.includes(target));
  }
  if (condition.operator === "not_contains") {
    return values.every((entry) => !entry.includes(target));
  }
  return false;
}

export function evaluateFieldConditions(params: {
  fieldType: string;
  baseRequired: boolean;
  baseOptions: string[];
  conditions?: FormFieldCondition[] | null;
  values: ConditionSourceValues;
}) {
  const { fieldType, baseRequired, baseOptions, conditions, values } = params;
  const activeConditions = (conditions ?? []).filter(
    (condition) => condition.enabled && condition.sourceKey
  );

  const showConditions = activeConditions.filter((condition) => condition.action === "show");
  const requireConditions = activeConditions.filter(
    (condition) => condition.action === "require"
  );
  const optionConditions = activeConditions.filter(
    (condition) => condition.action === "options"
  );

  const visible =
    showConditions.length === 0
      ? true
      : showConditions.some((condition) =>
          matchCondition(condition, values[condition.sourceKey])
        );
  const required =
    baseRequired ||
    requireConditions.some((condition) =>
      matchCondition(condition, values[condition.sourceKey])
    );

  let options = baseOptions;
  if (fieldType === "select" || fieldType === "multiselect") {
    if (optionConditions.length > 0) {
      const mergedOptions: string[] = [];
      for (const condition of optionConditions) {
        if (!matchCondition(condition, values[condition.sourceKey])) continue;
        mergedOptions.push(...condition.options);
      }
      if (mergedOptions.length > 0) {
        options = dedupeConditionOptions(mergedOptions);
      }
    }
  }

  return { visible, required, options };
}
