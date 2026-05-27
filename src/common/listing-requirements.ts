/** Platform listing & verification rules (single source of truth). */

export const INSPECTION_FEE_NGN = 5000;

export const GPS_PHOTO_MIN = 5;
export const GPS_PHOTO_MAX = 6;

export enum OwnershipDocumentType {
  COfO = 'c_of_o',
  UtilityBill = 'utility_bill',
  Deed = 'deed',
  GovernorsConsent = 'governors_consent',
  LandSurvey = 'land_survey',
}

export const RENT_REQUIRED_DOCS: OwnershipDocumentType[] = [
  OwnershipDocumentType.COfO,
  OwnershipDocumentType.UtilityBill,
];

export const SALE_REQUIRED_DOCS: OwnershipDocumentType[] = [
  OwnershipDocumentType.COfO,
  OwnershipDocumentType.Deed,
  OwnershipDocumentType.GovernorsConsent,
  OwnershipDocumentType.LandSurvey,
];

export function requiredDocsForListingType(listingType: 'rent' | 'buy'): OwnershipDocumentType[] {
  return listingType === 'rent' ? RENT_REQUIRED_DOCS : SALE_REQUIRED_DOCS;
}

export const OWNERSHIP_DOC_LABELS: Record<OwnershipDocumentType, string> = {
  [OwnershipDocumentType.COfO]: 'Certificate of Occupancy (C of O)',
  [OwnershipDocumentType.UtilityBill]: 'Utility bill',
  [OwnershipDocumentType.Deed]: 'Deed of assignment',
  [OwnershipDocumentType.GovernorsConsent]: "Governor's consent",
  [OwnershipDocumentType.LandSurvey]: 'Land survey plan',
};
