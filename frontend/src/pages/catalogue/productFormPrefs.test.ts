import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_PRODUCT_FORM_PREFS,
  readProductFormPrefs,
  updateProductFormPrefs,
  usedAdvancedFields,
  type AdvancedValues,
} from './productFormPrefs';

let store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  },
});

const blank: AdvancedValues = {
  purchase_price: '',
  reorder_level: '0',
  description: '',
  maintain_inventory: true,
  allow_decimal: false,
  track_serials: false,
  is_producable: false,
};

describe('product form prefs', () => {
  beforeEach(() => localStorage.clear());

  test('falls back to closed with nothing remembered', () => {
    expect(readProductFormPrefs()).toEqual(DEFAULT_PRODUCT_FORM_PREFS);
  });

  test('round-trips, and keeps one part when the other is updated', () => {
    updateProductFormPrefs({ used: ['purchase_price'] });
    updateProductFormPrefs({ showAdvanced: true });
    expect(readProductFormPrefs()).toEqual({ showAdvanced: true, used: ['purchase_price'] });
  });

  test('ignores malformed or unknown stored values', () => {
    localStorage.setItem('product_form_prefs', '{not json');
    expect(readProductFormPrefs()).toEqual(DEFAULT_PRODUCT_FORM_PREFS);

    localStorage.setItem('product_form_prefs', JSON.stringify({ showAdvanced: 'yes', used: ['description', 'bogus', 3] }));
    expect(readProductFormPrefs()).toEqual({ showAdvanced: false, used: ['description'] });
  });

  test('a field counts as used only when it differs from a new product', () => {
    expect(usedAdvancedFields(blank)).toEqual([]);
    expect(usedAdvancedFields({ ...blank, purchase_price: '0', description: '  ' })).toEqual([]);
    expect(
      usedAdvancedFields({ ...blank, purchase_price: '60', maintain_inventory: false, is_producable: true }),
    ).toEqual(['purchase_price', 'maintain_inventory', 'is_producable']);
  });
});
