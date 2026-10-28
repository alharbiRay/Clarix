/**
 * Validation messages come from zod schemas shared with the server, in
 * English. Forms show them through FormMessage, which looks them up here and
 * displays the translation (unknown messages show as written).
 */
export const VALIDATION_KEYS: Record<string, string> = {
  "Item name is required": "itemName",
  "Quantity must be greater than 0": "quantity",
  "Unit is required": "unit",
  "Title must be at least 3 characters": "title",
  "Deadline must be in the future": "deadline",
  "Add at least one line item": "items",
  "Invalid email": "email",
  "Add at least one supplier email": "suppliers",
  "Duplicate supplier emails": "duplicates",
};
