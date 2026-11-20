'use client';

import { useLocale } from 'next-intl';

export interface Named {
  nameAr: string;
  nameEn: string;
}
export interface ListItem extends Named {
  id: string;
  isActive: boolean;
  appliesTo?: 'medicine' | 'cosmetic' | 'both';
}
export interface Offer {
  id: string;
  offerType: 'discount' | 'bonus';
  discountPercent: string | null;
  buyQuantity: number | null;
  freeQuantity: number | null;
  startsOn: string | null;
  endsOn: string | null;
  isActive?: boolean;
  isCurrent?: boolean;
}
export interface ExtraField extends Named {
  id: string;
  fieldType: 'text' | 'number' | 'yes_no' | 'date' | 'choice';
  choices: string[];
  appliesTo: 'medicine' | 'cosmetic' | 'both';
  isRequired: boolean;
  shownToCustomers: boolean;
  isActive: boolean;
}
export interface Product extends Named {
  id: string;
  productType: 'medicine' | 'cosmetic';
  barcode: string | null;
  brandId: string;
  categoryId: string;
  brand: Named;
  category: Named;
  unit: string;
  packSize: string;
  sellingPrice: string;
  costPrice?: string;
  description: string | null;
  trackBatches?: boolean;
  isActive?: boolean;
  keepCold: boolean;
  medicine: null | {
    activeIngredient: string;
    strength: string;
    dosageFormId: string;
    dosageForm: Named;
    storage: 'room' | 'fridge';
    publicPrice: string | null;
    registrationNumber?: string | null;
    needsPrescription: boolean | null;
  };
  cosmetic: null | { shadeName: string | null; shadeNumber: string | null; suitableFor: string | null; periodAfterOpeningMonths: number | null };
  extraValues: Record<string, string>;
  inStock: boolean;
  stock?: { onHand: number; reserved: number; held: number; available: number };
  offer: Offer | null;
  offers?: Offer[];
}

// The name in the current language
export function useName() {
  const locale = useLocale();
  return (x: Named | null | undefined) => (x ? (locale === 'ar' ? x.nameAr : x.nameEn) : '');
}

export function useDateFormat() {
  const locale = useLocale();
  return (iso: string, withTime = false) =>
    new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', withTime ? undefined : { dateStyle: 'medium' });
}
