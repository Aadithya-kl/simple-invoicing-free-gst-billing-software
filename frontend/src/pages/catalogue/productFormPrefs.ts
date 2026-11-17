const STORAGE_KEY = 'product_form_prefs';

/**
 * Fields most people never touch when adding a product. They sit behind
 * "More options" so a first product is name, price and GST, not a page of
 * settings.
 */
export const ADVANCED_FIELDS = [
  'purchase_price',
  'reorder_level',
  'description',
  'maintain_inventory',
  'allow_decimal',
  'track_serials',
  'is_producable',
] as const;

export type AdvancedField = (typeof ADVANCED_FIELDS)[number];

export const ADVANCED_FIELD_LABELS: Record<AdvancedField, string> = {
  purchase_price: 'purchase price',
  reorder_level: 'reorder level',
  description: 'description',
  maintain_inventory: 'stock counting',
  allow_decimal: 'fractional quantities',
  track_serials: 'serial numbers',
  is_producable: 'manufacturing',
};

export type ProductFormPrefs = {
  /** "More options" left open shows every advanced field next time. */
  showAdvanced: boolean;
  /** Advanced fields filled in on the last product created; shown even when closed. */
  used: AdvancedField[];
};

export const DEFAULT_PRODUCT_FORM_PREFS: ProductFormPrefs = { showAdvanced: false, used: [] };

/** The advanced part of the form's state, as the form holds it. */
export type AdvancedValues = {
  purchase_price: string;
  reorder_level: string;
  description: string;
  maintain_inventory: boolean;
  allow_decimal: boolean;
  track_serials: boolean;
  is_producable: boolean;
};

function isAdvancedField(value: unknown): value is AdvancedField {
  return typeof value === 'string' && (ADVANCED_FIELDS as readonly string[]).includes(value);
}

function nonZero(value: string): boolean {
  return value.trim() !== '' && Number(value) !== 0;
}

/** Whether a field differs from what a new product starts with. */
export function isAdvancedFieldSet(values: AdvancedValues, field: AdvancedField): boolean {
  switch (field) {
    case 'purchase_price':
      return nonZero(values.purchase_price);
    case 'reorder_level':
      return nonZero(values.reorder_level);
    case 'description':
      return values.description.trim() !== '';
    case 'maintain_inventory':
      return !values.maintain_inventory;
    case 'allow_decimal':
      return values.allow_decimal;
    case 'track_serials':
      return values.track_serials;
    case 'is_producable':
      return values.is_producable;
  }
}

/**
 * Shown when the section is open, when it was used last time, or when it holds
 * a value: a set field is never hidden, so nothing is saved out of sight.
 */
export function isAdvancedFieldVisible(
  field: AdvancedField,
  values: AdvancedValues,
  prefs: ProductFormPrefs,
): boolean {
  return prefs.showAdvanced || prefs.used.includes(field) || isAdvancedFieldSet(values, field);
}

export function usedAdvancedFields(values: AdvancedValues): AdvancedField[] {
  return ADVANCED_FIELDS.filter((field) => isAdvancedFieldSet(values, field));
}

/** Stored JSON is untrusted, so each part is checked and falls back on its own. */
export function readProductFormPrefs(): ProductFormPrefs {
  const defaults = DEFAULT_PRODUCT_FORM_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const stored = parsed as Record<string, unknown>;
    return {
      showAdvanced: typeof stored.showAdvanced === 'boolean' ? stored.showAdvanced : defaults.showAdvanced,
      used: Array.isArray(stored.used) ? stored.used.filter(isAdvancedField) : defaults.used,
    };
  } catch {
    // Malformed JSON, or storage unavailable in a privacy mode.
    return defaults;
  }
}

export function updateProductFormPrefs(patch: Partial<ProductFormPrefs>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readProductFormPrefs(), ...patch }));
  } catch {
    // Storage disabled: the choice still holds while the form is open.
  }
}
