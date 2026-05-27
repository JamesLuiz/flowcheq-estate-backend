# House Me — Backend Technical Document
### NestJS Microservice Architecture | MongoDB | v1.0

---

## SECTION 1: APPLICATION MODULE MAP

Based on the full PRD, the House Me backend is composed of **17 core modules**:

| # | Module | Status | Priority |
|---|--------|--------|----------|
| 1 | `AuthModule` | Modify | P0 |
| 2 | `UsersModule` | Modify | P0 |
| 3 | `LandlordsModule` | Build | P0 |
| 4 | `PropertiesModule` | Modify + Advance | P0 |
| 5 | `FieldVerifiersModule` | Build | P0 |
| 6 | `VerificationModule` | Build | P0 |
| 7 | `SearchModule` | Advance | P0 |
| 8 | `AreaRentIndexModule` | Build | P1 |
| 9 | `RNPLModule` (Rent-Now-Pay-Later) | Build | P1 |
| 10 | `LegalDocumentsModule` | Build | P1 |
| 11 | `MessagingModule` | Modify | P1 |
| 12 | `ViewingsModule` | Modify | P1 |
| 13 | `SubscriptionsModule` | Build | P1 |
| 14 | `PromotionsModule` | Modify | P2 |
| 15 | `ReviewsModule` | Build | P2 |
| 16 | `ServicesMarketplaceModule` | Build | P2 |
| 17 | `AdminModule` | Modify + Advance | P0 |

---

## SECTION 2: ARCHITECTURE OVERVIEW

```
house-me-backend/
├── apps/
│   ├── gateway/                    # API Gateway (entry point, auth guards, rate limiting)
│   ├── auth-service/               # Auth + Users + Landlords
│   ├── property-service/           # Properties + Field Verification + Search
│   ├── financial-service/          # RNPL + Subscriptions + Promotions
│   ├── legal-service/              # Legal Documents + E-sign
│   ├── comms-service/              # Messaging + Viewings + Notifications
│   ├── analytics-service/          # Area Rent Index + Admin analytics
│   └── marketplace-service/        # Reviews + Services Marketplace
├── libs/
│   ├── common/                     # Shared DTOs, guards, decorators, pipes
│   ├── database/                   # MongoDB connection + base schemas
│   └── events/                     # Shared event/message patterns (NATS/Redis)
├── docker-compose.yml
└── nest-cli.json
```

**Inter-service communication**: NestJS TCP transport (microservice pattern) for internal calls; REST over HTTP for external clients via the Gateway.

**Database**: Each service owns its MongoDB collection namespace. Shared MongoDB cluster, isolated by collection prefix (e.g., `auth_users`, `property_listings`).

---

## SECTION 3: MODULE SPECIFICATIONS

---

### MODULE 1: AuthModule

**Status**: MODIFY (existing auth exists; needs role expansion + new flows)
**Service**: `auth-service`

#### What Exists
- Basic email/password auth
- JWT tokens
- Roles: `user`, `agent`, `admin`

#### What Changes
- **REMOVE** `agent` role entirely — replace with `landlord` and `real_estate_company`
- **ADD** `field_verifier` role
- **ADD** BVN/NIN capture at registration (stored encrypted, not displayed)
- **ADD** phone number OTP verification on registration (via Termii or AfricasTalking)
- **ADD** OAuth2 social login (Google) — optional Phase 2

#### Schemas

```typescript
// User schema additions
{
  role: enum ['tenant', 'landlord', 'real_estate_company', 'field_verifier', 'admin'],
  phone: string,               // required
  phoneVerified: boolean,      // default false
  bvn: string (encrypted),     // required for landlords
  nin: string (encrypted),     // required for landlords
  kycStatus: enum ['pending', 'approved', 'rejected', 'suspended'],
  kycSubmittedAt: Date,
  kycReviewedAt: Date,
  kycRejectionReason: string,
  isActive: boolean,
  lastLoginAt: Date,
  deviceTokens: string[],       // for push notifications
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register/tenant` | Public | Register as a tenant |
| POST | `/auth/register/landlord` | Public | Register as individual landlord |
| POST | `/auth/register/company` | Public | Register as real estate company |
| POST | `/auth/register/field-verifier` | Admin | Create a field verifier account |
| POST | `/auth/login` | Public | Email + password login → JWT |
| POST | `/auth/logout` | JWT | Invalidate refresh token |
| POST | `/auth/refresh` | JWT | Rotate access/refresh tokens |
| POST | `/auth/verify-phone` | JWT | Submit OTP for phone verification |
| POST | `/auth/resend-otp` | JWT | Resend phone OTP |
| POST | `/auth/forgot-password` | Public | Send reset link to email |
| POST | `/auth/reset-password` | Public (token) | Submit new password |
| GET | `/auth/me` | JWT | Return current user profile |
| PATCH | `/auth/me` | JWT | Update name, phone (re-verifies), avatar |

---

### MODULE 2: UsersModule

**Status**: MODIFY
**Service**: `auth-service`

#### What Changes
- Rename and restructure the "user" profile (tenants)
- Add `Nestin ID` / tenant verification profile
- Remove viewing fee from user flows (fees abolished for tenants)

#### Schemas

```typescript
// TenantProfile (extends User)
{
  userId: ObjectId,
  fullName: string,
  profilePhoto: string (Cloudinary URL),
  occupation: string,
  employer: string,
  monthlyIncome: number (encrypted),   // for RNPL eligibility pre-check
  monoAccountId: string,               // from Mono SDK link
  guarantorName: string,
  guarantorPhone: string,
  guarantorRelationship: string,
  savedProperties: ObjectId[],
  rentalHistory: ObjectId[],           // past tenancies on platform
  nestinIdVerified: boolean,
  nestinIdVerifiedAt: Date,
  reviewScore: number,                 // avg rating from past landlords
  reviewCount: number,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/profile` | JWT (tenant) | Get own full profile |
| PATCH | `/users/profile` | JWT (tenant) | Update profile details |
| POST | `/users/profile/photo` | JWT (tenant) | Upload profile photo |
| GET | `/users/saved-properties` | JWT (tenant) | List saved/bookmarked properties |
| POST | `/users/saved-properties/:propertyId` | JWT (tenant) | Save a property |
| DELETE | `/users/saved-properties/:propertyId` | JWT (tenant) | Remove saved property |
| POST | `/users/nestin-id/verify` | JWT (tenant) | Submit docs for Nestin ID verification |
| GET | `/users/nestin-id/status` | JWT (tenant) | Check Nestin ID verification status |

---

### MODULE 3: LandlordsModule

**Status**: BUILD (replaces AgentsModule entirely)
**Service**: `auth-service`

#### Description
Manages both **Individual Landlords** and **Real Estate Companies** — two distinct KYC tracks with different document requirements. Both share the same listing rights but different profile structures.

#### Schemas

```typescript
// LandlordProfile
{
  userId: ObjectId,
  type: enum ['individual', 'company'],
  displayName: string,
  profilePhoto: string,
  bio: string,
  // Individual only:
  nin: string (encrypted),
  bvn: string (encrypted),
  // Company only:
  cacNumber: string,
  cacCertificateUrl: string,
  companyTin: string,
  directorBvn: string (encrypted),
  // Both:
  ownershipDocuments: [
    { type: enum ['c_of_o', 'deed_of_assignment', 'allocation_paper', 'utility_bill'],
      url: string,
      uploadedAt: Date }
  ],
  kycStatus: enum ['pending', 'under_review', 'approved', 'rejected', 'suspended'],
  kycNotes: string,               // admin notes on rejection reason
  verifiedLandlordBadge: boolean,
  activeListingsCount: number,
  totalListingsCount: number,
  totalEnquiries: number,
  memberSince: Date,
  reviewScore: number,
  reviewCount: number,
  subscriptionTier: enum ['free', 'basic', 'pro'],
  subscriptionExpiresAt: Date,
  bankAccountName: string,
  bankAccountNumber: string,
  bankCode: string,
  flutterwaveVirtualAccount: object,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/landlords/profile` | JWT (landlord) | Get own landlord profile |
| PATCH | `/landlords/profile` | JWT (landlord) | Update bio, display name, photo |
| POST | `/landlords/kyc/individual` | JWT (landlord) | Submit individual KYC documents |
| POST | `/landlords/kyc/company` | JWT (landlord) | Submit company KYC documents |
| GET | `/landlords/kyc/status` | JWT (landlord) | Check KYC approval status |
| GET | `/landlords/dashboard` | JWT (landlord) | Dashboard stats (listings, views, enquiries) |
| GET | `/landlords/enquiries` | JWT (landlord) | All enquiries received across listings |
| POST | `/landlords/bank-account` | JWT (landlord) | Set bank account for payouts |
| GET | `/landlords/bank-account` | JWT (landlord) | Get configured bank account |
| GET | `/landlords/:id/public` | Public | Public landlord profile (verified badge, listings count, reviews) |
| GET | `/landlords/:id/listings` | Public | All active listings by this landlord |

---

### MODULE 4: PropertiesModule

**Status**: MODIFY + ADVANCE
**Service**: `property-service`

#### What Changes
- **REMOVE** `viewingFee` field — viewing is always ₦0 for tenants
- **REMOVE** agent-as-owner model
- **ADD** GPS coordinate locking with duplicate detection
- **ADD** `verificationStatus` field gated to `FieldVerifiersModule`
- **ADD** `listingType` to distinguish long-term rental, short-let, for-sale
- **ADD** `amenities` structured checklist
- **ADD** `priceAlertTriggered` flag (from Area Rent Index comparison)
- **ADD** soft delete (archive) instead of hard delete
- **MODIFY** photo tagging schema — now enforces minimum 8 tagged photos
- **ADD** area rent comparison fields (populated by `AreaRentIndexModule`)

#### Schema

```typescript
// Property
{
  landlordId: ObjectId,
  title: string,
  description: string (rich text HTML),
  listingType: enum ['long_term_rental', 'short_let', 'for_sale'],
  propertyType: enum ['flat', 'self_con', 'duplex', 'bungalow', 'room_parlour', 'studio', 'detached', 'semi_detached', 'terraced'],
  bedrooms: number,
  bathrooms: number,
  toilets: number,
  floor: number | null,
  areaSqft: number,
  address: {
    street: string,
    district: string,
    city: string,
    state: string,
    country: 'Nigeria',
  },
  coordinates: { lat: number, lng: number },   // locked on creation; only updatable via admin
  coordinatesVerifiedByFieldWorker: boolean,
  annualRent: number,             // in kobo (avoid float precision issues)
  cautionDeposit: number,
  shortLetNightlyRate: number | null,
  shortLetMinimumNights: number | null,
  availableFrom: Date,
  photos: [
    { tag: enum ['exterior','sitting_room','bedroom','kitchen','bathroom','toilet','compound','gate','balcony','other'],
      url: string,
      description: string,
      uploadedAt: Date,
      capturedByFieldVerifier: boolean }
  ],
  amenities: {
    waterSupply: enum ['borehole', 'phcn', 'both', 'none'],
    hasParking: boolean,
    hasSecurity: boolean,
    hasGenerator: boolean,
    hasInverter: boolean,
    hasSolar: boolean,
    hasDSTVPoint: boolean,
    hasInternet: boolean,
    hasFittedKitchen: boolean,
    isTiled: boolean,
    hasServantQuarters: boolean,
    hasBQ: boolean,
  },
  verificationStatus: enum ['draft', 'pending_verification', 'verified', 'rejected', 'expired'],
  verificationId: ObjectId | null,
  isActive: boolean,
  isFeatured: boolean,
  featuredUntil: Date | null,
  isSharedProperty: boolean,
  totalSlots: number | null,
  filledSlots: number | null,
  proofOfOwnershipUrl: string,   // admin-only visibility
  viewCount: number,
  enquiryCount: number,
  daysOnMarket: number,          // computed daily
  areaMedianRent: number | null, // populated by AreaRentIndexModule
  priceVsMedian: number | null,  // percentage above/below median
  priceAlert: boolean,           // true if >15% above median
  status: enum ['active', 'rented', 'paused', 'archived'],
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/properties` | JWT (landlord, KYC approved) | Create new listing (enters pending_verification) |
| GET | `/properties` | Public | List active+verified properties (paginated, filtered) |
| GET | `/properties/:id` | Public | Single property detail page |
| PATCH | `/properties/:id` | JWT (landlord, owner) | Edit listing (re-enters pending if address/coordinates changed) |
| DELETE | `/properties/:id` | JWT (landlord, owner) | Soft-delete / archive listing |
| POST | `/properties/:id/pause` | JWT (landlord, owner) | Temporarily hide listing |
| POST | `/properties/:id/activate` | JWT (landlord, owner) | Re-activate a paused listing |
| POST | `/properties/:id/photos` | JWT (landlord, owner) | Upload photos (tagged) |
| DELETE | `/properties/:id/photos/:photoId` | JWT (landlord, owner) | Remove a photo |
| POST | `/properties/:id/mark-rented` | JWT (landlord, owner) | Mark property as rented |
| GET | `/properties/:id/price-comparison` | Public | Area median comparison for this property |
| GET | `/properties/my` | JWT (landlord) | Landlord's own listings (all statuses) |
| GET | `/properties/nearby` | Public | Properties within radius of coordinates |
| POST | `/properties/:id/enquire` | JWT (tenant) | Register an enquiry (triggers contact reveal) |
| GET | `/properties/:id/contact` | JWT (tenant, post-enquiry) | Reveal landlord phone number |

---

### MODULE 5: FieldVerifiersModule

**Status**: BUILD
**Service**: `property-service`

#### Description
Manages the field verifier workforce — salaried/per-task employees of House Me who physically visit and authenticate property listings. This module handles their profiles, assignment queue, and payout records.

#### Schema

```typescript
// FieldVerifier
{
  userId: ObjectId,
  fullName: string,
  phone: string,
  operatingDistricts: string[],   // districts they cover
  currentLocation: { lat: number, lng: number },
  isAvailable: boolean,
  totalVerificationsCompleted: number,
  totalEarnings: number,
  bankAccountName: string,
  bankAccountNumber: string,
  bankCode: string,
  isActive: boolean,
}

// VerificationAssignment
{
  propertyId: ObjectId,
  fieldVerifierId: ObjectId,
  assignedAt: Date,
  scheduledVisitDate: Date,
  status: enum ['assigned', 'in_progress', 'completed', 'failed', 'reassigned'],
  checkInCoordinates: { lat: number, lng: number } | null,
  checkInDistanceFromProperty: number | null,  // metres
  checkInTime: Date | null,
  photos: string[],                // Cloudinary URLs captured during visit
  verifierNotes: string,
  conditionReport: {
    structuralIssues: boolean,
    addressMatchesListing: boolean,
    photosAccurateRepresentation: boolean,
    accessibilityConfirmed: boolean,
    overallAssessment: enum ['pass', 'fail', 'pass_with_notes'],
  },
  completedAt: Date | null,
  payoutAmount: number,
  payoutStatus: enum ['pending', 'processing', 'paid'],
  payoutReference: string,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/field-verifiers/profile` | JWT (field_verifier) | Own profile + stats |
| GET | `/field-verifiers/assignments` | JWT (field_verifier) | Assigned verifications queue |
| GET | `/field-verifiers/assignments/:id` | JWT (field_verifier) | Single assignment detail |
| POST | `/field-verifiers/assignments/:id/check-in` | JWT (field_verifier) | GPS check-in (must be within 30m of property) |
| POST | `/field-verifiers/assignments/:id/submit` | JWT (field_verifier) | Submit condition report + photos |
| GET | `/field-verifiers/earnings` | JWT (field_verifier) | Earnings history |
| PATCH | `/field-verifiers/availability` | JWT (field_verifier) | Toggle availability |
| PATCH | `/field-verifiers/location` | JWT (field_verifier) | Update current GPS location |

---

### MODULE 6: VerificationModule

**Status**: BUILD
**Service**: `property-service`

#### Description
Orchestrates the full property verification lifecycle — from landlord submission, to admin assignment of a field verifier, to badge application.

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/verification/request` | JWT (landlord) | Submit property for verification (auto-triggered on listing creation) |
| GET | `/verification/queue` | JWT (admin) | All pending verification requests |
| POST | `/verification/:id/assign` | JWT (admin) | Assign field verifier to a property |
| POST | `/verification/:id/reassign` | JWT (admin) | Reassign to different verifier |
| POST | `/verification/:id/approve` | JWT (admin) | Approve verification → property goes live |
| POST | `/verification/:id/reject` | JWT (admin) | Reject with reason → notifies landlord |
| GET | `/verification/:propertyId/status` | JWT (landlord, owner) | Check verification status of own property |
| GET | `/verification/:id/report` | JWT (admin) | Full verification report with photos + field notes |

---

### MODULE 7: SearchModule

**Status**: ADVANCE
**Service**: `property-service`

#### What Changes
- **ADD** filter by monthly installment (computed from annual rent / 12)
- **ADD** filter by `verifiedOnly` (default true)
- **ADD** `nearbyLandmark` search using geocoding
- **ADD** full-text search across title + description + district
- **ADD** duplicate GPS detection utility (used during property creation)
- **MODIFY** sort options: add `priceVsMedian` (fair price first), `daysOnMarket` (newest first)
- **ADD** map cluster endpoint (returns GeoJSON for map view)

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search/properties` | Public | Full search with all filters |
| GET | `/search/properties/map` | Public | GeoJSON cluster data for map view |
| GET | `/search/suggest` | Public | Autocomplete for district/street names |
| GET | `/search/nearby` | Public | Properties within radius of lat/lng |
| POST | `/search/check-duplicate` | JWT (landlord) | Check if coordinates already have a listing |

#### Query Parameters for GET `/search/properties`

```
district: string
city: string
state: string
propertyType: string[]
listingType: 'long_term_rental' | 'short_let' | 'for_sale'
minRent: number (annual, kobo)
maxRent: number (annual, kobo)
minMonthlyInstallment: number (kobo)
maxMonthlyInstallment: number (kobo)
bedrooms: number[]
bathrooms: number
hasParking: boolean
hasGenerator: boolean
hasSecurity: boolean
hasWater: boolean
verifiedOnly: boolean (default: true)
availableFrom: ISO date
rnplEligible: boolean
sortBy: 'newest' | 'price_asc' | 'price_desc' | 'fair_price' | 'days_on_market'
page: number
limit: number (max 50)
```

---

### MODULE 8: AreaRentIndexModule

**Status**: BUILD
**Service**: `analytics-service`

#### Description
Computes and maintains the Area Rent Index (ARI) — the platform's pricing intelligence layer. Runs as a scheduled job (cron) and populates `areaMedianRent` and `priceVsMedian` on property documents.

#### Schema

```typescript
// AreaRentIndexSnapshot
{
  district: string,
  city: string,
  state: string,
  propertyType: string,
  bedrooms: number,
  p25Rent: number,          // 25th percentile annual rent
  medianRent: number,
  p75Rent: number,          // 75th percentile annual rent
  sampleSize: number,       // number of listings used
  trendVs6Months: number,   // % change vs 6-month prior snapshot
  computedAt: Date,
  validUntil: Date,         // 7 days; after this, re-compute
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/area-rent-index/:district` | Public | ARI for a district (all property types) |
| GET | `/area-rent-index/:district/:type/:bedrooms` | Public | Specific ARI band |
| GET | `/area-rent-index/compare` | Public | Compare multiple districts |
| POST | `/area-rent-index/recompute` | JWT (admin) | Manually trigger recomputation |
| GET | `/area-rent-index/public-dashboard` | Public | Data for public area dashboards page |

**Cron jobs**:
- `@Cron('0 2 * * *')` — recompute all ARI snapshots nightly at 2AM
- `@Cron('0 3 * * *')` — update `priceVsMedian` and `priceAlert` on all active properties

---

### MODULE 9: RNPLModule (Rent-Now-Pay-Later)

**Status**: BUILD
**Service**: `financial-service`

#### Description
Handles the bank-partnership RNPL flow. House Me is NOT the lender — it is the eligibility check and loan referral layer. The bank partner API does the actual lending.

#### Schema

```typescript
// RNPLApplication
{
  tenantId: ObjectId,
  propertyId: ObjectId,
  landlordId: ObjectId,
  annualRentAmount: number,
  requestedLoanAmount: number,
  monoAccountId: string,
  monoVerifiedAt: Date,
  eligibilityStatus: enum ['checking', 'eligible', 'ineligible', 'pending_bank_review'],
  eligibilityScore: number | null,
  bankPartnerName: string,
  bankLoanReference: string | null,
  bankLoanStatus: enum ['not_submitted', 'submitted', 'approved', 'rejected', 'disbursed'],
  monthlyRepaymentAmount: number | null,
  interestRate: number | null,
  loanTermMonths: number | null,
  disbursedToLandlordAt: Date | null,
  nestinReferralFee: number | null,
  nestinFeeStatus: enum ['pending', 'received'],
  createdAt: Date,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/rnpl/check-eligibility` | JWT (tenant) | Initiate Mono link + run eligibility check |
| GET | `/rnpl/eligibility/:propertyId` | JWT (tenant) | Get pre-computed eligibility for a property |
| POST | `/rnpl/apply` | JWT (tenant) | Submit formal RNPL application to bank partner |
| GET | `/rnpl/applications` | JWT (tenant) | Own RNPL applications |
| GET | `/rnpl/applications/:id` | JWT (tenant) | Single application status |
| POST | `/rnpl/webhook/bank-callback` | Public (signed) | Receive bank partner loan status updates |
| GET | `/rnpl/admin/applications` | JWT (admin) | All applications (admin view) |
| GET | `/rnpl/admin/referral-fees` | JWT (admin) | Referral fee tracker |

---

### MODULE 10: LegalDocumentsModule

**Status**: BUILD
**Service**: `legal-service`

#### Description
Generates, stores, and manages legally binding tenancy agreements. Partners with a Nigerian law firm. E-signatures captured with full audit trail. Compliant with Cybercrimes Act 2015 and Evidence (Amendment) Act 2023.

#### Schema

```typescript
// LegalDocument
{
  propertyId: ObjectId,
  landlordId: ObjectId,
  tenantId: ObjectId,
  templateVersion: string,        // e.g., 'FCT_v1.2'
  state: string,                  // determines which state-specific template
  status: enum ['draft', 'awaiting_tenant_signature', 'awaiting_landlord_signature', 'fully_executed', 'expired', 'disputed'],
  tenancyStartDate: Date,
  tenancyEndDate: Date,
  annualRent: number,
  cautionDepositAmount: number,
  paymentSchedule: enum ['annual', 'biannual', 'quarterly', 'monthly_rnpl'],
  noticePeriodDays: number,       // from state law
  specialClauses: string[],       // pre-approved clauses only
  documentUrl: string | null,     // Cloudinary PDF URL after generation
  documentHash: string | null,    // SHA-256 of PDF for tamper detection
  paymentReference: string | null,
  paymentStatus: enum ['pending', 'paid'],
  paymentAmount: 1500000,         // ₦15,000 in kobo
  signatures: {
    tenant: {
      signedAt: Date | null,
      ipAddress: string | null,
      deviceId: string | null,
      signatureImageUrl: string | null,
    },
    landlord: {
      signedAt: Date | null,
      ipAddress: string | null,
      deviceId: string | null,
      signatureImageUrl: string | null,
    }
  },
  auditTrail: [{
    event: string,
    timestamp: Date,
    actorId: ObjectId,
    actorRole: string,
    ipAddress: string,
    metadata: object,
  }],
  lawFirmReference: string,       // reference number issued by partner law firm
  createdAt: Date,
  executedAt: Date | null,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/legal-documents/initiate` | JWT (tenant) | Start document generation (triggers payment) |
| POST | `/legal-documents/:id/pay` | JWT (tenant) | Pay ₦15,000 via Flutterwave/Paystack |
| POST | `/legal-documents/payment-callback` | Public (signed) | Payment provider webhook |
| GET | `/legal-documents/:id/preview` | JWT (tenant or landlord, party) | Preview pre-filled document before signing |
| POST | `/legal-documents/:id/sign` | JWT (tenant or landlord, party) | Submit e-signature |
| GET | `/legal-documents/:id/download` | JWT (party or admin) | Download executed PDF |
| GET | `/legal-documents/:id/audit-trail` | JWT (admin) | Full audit log |
| GET | `/legal-documents/my` | JWT (tenant or landlord) | Own documents history |
| GET | `/legal-documents/templates` | JWT (admin) | Manage templates |
| POST | `/legal-documents/templates` | JWT (admin) | Upload new state template |

---

### MODULE 11: MessagingModule

**Status**: MODIFY
**Service**: `comms-service`

#### What Changes
- **REMOVE** agent-to-user messaging context
- **ADD** landlord-to-tenant direct messaging (post-enquiry only)
- **ADD** message threading per property
- **ADD** automated system messages (verification status, document ready, etc.)
- **ADD** WhatsApp number reveal (post-enquiry trigger)

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/messages/threads` | JWT | All conversation threads |
| GET | `/messages/threads/:threadId` | JWT | Messages in a thread |
| POST | `/messages/threads/:threadId` | JWT | Send a message |
| POST | `/messages/threads/start` | JWT (tenant, post-enquiry) | Start thread with landlord for a property |
| DELETE | `/messages/threads/:threadId/:messageId` | JWT (sender) | Delete own message |
| POST | `/messages/threads/:threadId/report` | JWT | Report a conversation |

---

### MODULE 12: ViewingsModule

**Status**: MODIFY
**Service**: `comms-service`

#### What Changes
- **REMOVE** all viewing fees — viewing is ₦0 for tenants
- **REMOVE** Flutterwave payment flow from viewings
- **MODIFY** to a scheduling coordination tool only
- **ADD** self-guided visit scheduling (tenant requests preferred time)
- **ADD** landlord confirms/declines visit slot

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/viewings/request` | JWT (tenant) | Request a viewing slot |
| GET | `/viewings/my` | JWT (tenant) | Own scheduled viewings |
| GET | `/viewings/landlord` | JWT (landlord) | Viewing requests for own properties |
| POST | `/viewings/:id/confirm` | JWT (landlord) | Confirm a viewing request |
| POST | `/viewings/:id/decline` | JWT (landlord) | Decline with reason |
| POST | `/viewings/:id/cancel` | JWT (tenant or landlord) | Cancel a confirmed viewing |
| POST | `/viewings/:id/complete` | JWT (landlord) | Mark viewing as completed |

---

### MODULE 13: SubscriptionsModule

**Status**: BUILD
**Service**: `financial-service`

#### Description
Handles landlord subscription plans — the primary recurring revenue stream.

#### Tiers
| Tier | Price | Listings | Features |
|------|-------|----------|----------|
| Free | ₦0/mo | 1 | Basic listing, standard verification queue |
| Basic | ₦5,000/mo | 5 | Priority verification, enquiry tracker |
| Pro | ₦15,000/mo | Unlimited | All features + analytics + priority support |

#### Schema

```typescript
// Subscription
{
  landlordId: ObjectId,
  tier: enum ['free', 'basic', 'pro'],
  status: enum ['active', 'cancelled', 'expired', 'past_due'],
  billingCycle: enum ['monthly', 'annual'],
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  paymentReference: string,
  autoRenew: boolean,
  cancelledAt: Date | null,
  cancelReason: string | null,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/subscriptions/plans` | Public | Available subscription tiers + pricing |
| GET | `/subscriptions/current` | JWT (landlord) | Active subscription details |
| POST | `/subscriptions/subscribe` | JWT (landlord) | Initiate subscription payment |
| POST | `/subscriptions/webhook` | Public (signed) | Payment provider webhook |
| POST | `/subscriptions/cancel` | JWT (landlord) | Cancel subscription |
| GET | `/subscriptions/invoices` | JWT (landlord) | Billing history |
| GET | `/subscriptions/admin` | JWT (admin) | All subscriptions + MRR metrics |

---

### MODULE 14: PromotionsModule

**Status**: MODIFY
**Service**: `financial-service`

#### What Changes
- **MODIFY** to support new promotion slots: `homepage_hero`, `district_top`, `map_highlight`
- **ADD** bundle packages (multiple listings or promotion types)
- **REMOVE** agent-based promotion models

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/promotions/packages` | Public | Available promotion packages + pricing |
| POST | `/promotions/create` | JWT (landlord, KYC approved) | Purchase a promotion |
| POST | `/promotions/callback` | Public (signed) | Payment callback |
| GET | `/promotions/my` | JWT (landlord) | Own active/past promotions |
| GET | `/promotions/admin` | JWT (admin) | All promotions management |
| POST | `/promotions/:id/cancel` | JWT (admin) | Cancel a promotion |

---

### MODULE 15: ReviewsModule

**Status**: BUILD
**Service**: `comms-service`

#### Description
Two-sided review system. Tenants review landlords after a tenancy ends. Landlords review tenants. Both require a completed tenancy (legal document executed) to post a review.

#### Schema

```typescript
// Review
{
  reviewerId: ObjectId,
  reviewerRole: enum ['tenant', 'landlord'],
  subjectId: ObjectId,
  subjectRole: enum ['landlord', 'tenant'],
  propertyId: ObjectId,
  legalDocumentId: ObjectId,     // proof of completed tenancy
  overallRating: number,         // 1–5
  categories: {
    responsiveness: number,       // 1–5 (for landlord reviews)
    accuracy: number,             // listing accuracy (for landlord)
    fairness: number,             // fair dealing
    propertyCondition: number,    // condition on move-in (for landlord)
    paymentReliability: number,   // for tenant reviews
    propertyRespect: number,      // how tenant treated property
  },
  reviewText: string,
  isAnonymous: boolean,
  status: enum ['published', 'flagged', 'removed'],
  helpfulVotes: number,
  createdAt: Date,
}
```

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reviews` | JWT (tenant or landlord) | Submit a review |
| GET | `/reviews/landlord/:landlordId` | Public | Reviews for a landlord |
| GET | `/reviews/tenant/:tenantId` | JWT (landlord) | Reviews for a tenant (visible only to landlords) |
| POST | `/reviews/:id/helpful` | JWT | Mark review as helpful |
| POST | `/reviews/:id/flag` | JWT | Flag review for moderation |
| GET | `/reviews/admin` | JWT (admin) | Review moderation queue |
| DELETE | `/reviews/:id` | JWT (admin) | Remove a review |

---

### MODULE 16: ServicesMarketplaceModule

**Status**: BUILD (Phase 2)
**Service**: `marketplace-service`

#### Description
Ancillary services marketplace — movers, cleaners, handymen, furniture — referred through the platform. House Me earns 5–15% referral commission.

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/services` | Public | List available service providers by category |
| GET | `/services/:category` | Public | Services in a category (movers, cleaners, etc.) |
| GET | `/services/providers/:id` | Public | Service provider profile |
| POST | `/services/book` | JWT (tenant) | Book/refer a service |
| GET | `/services/bookings` | JWT (tenant) | Own service bookings |
| POST | `/services/providers` | JWT (admin) | Onboard a service provider |
| GET | `/services/admin/commissions` | JWT (admin) | Commission tracking |

---

### MODULE 17: AdminModule

**Status**: MODIFY + ADVANCE
**Service**: `gateway` (admin-specific routes proxied to relevant services)

#### What Changes
- **ADD** KYC approval queue (landlords + field verifiers)
- **ADD** Field verifier assignment queue
- **ADD** Legal document oversight
- **ADD** Area Rent Index management
- **ADD** Platform analytics dashboard
- **REMOVE** agent management flows
- **MODIFY** user management to new role structure

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/dashboard` | JWT (admin) | Platform KPIs (listings, users, revenue, verifications) |
| GET | `/admin/users` | JWT (admin) | All users with filters |
| PATCH | `/admin/users/:id/suspend` | JWT (admin) | Suspend any user |
| PATCH | `/admin/users/:id/restore` | JWT (admin) | Restore suspended user |
| GET | `/admin/kyc/queue` | JWT (admin) | Pending KYC submissions |
| POST | `/admin/kyc/:id/approve` | JWT (admin) | Approve KYC |
| POST | `/admin/kyc/:id/reject` | JWT (admin) | Reject KYC with reason |
| GET | `/admin/properties` | JWT (admin) | All properties any status |
| POST | `/admin/properties/:id/force-remove` | JWT (admin) | Remove fraudulent listing |
| GET | `/admin/verification/queue` | JWT (admin) | Pending property verifications |
| GET | `/admin/field-verifiers` | JWT (admin) | All field verifier profiles |
| POST | `/admin/field-verifiers/:id/assign` | JWT (admin) | Assign verifier to property |
| GET | `/admin/legal-documents` | JWT (admin) | All legal documents |
| GET | `/admin/rnpl/applications` | JWT (admin) | All RNPL applications |
| GET | `/admin/subscriptions` | JWT (admin) | Subscription + MRR dashboard |
| GET | `/admin/reviews/queue` | JWT (admin) | Flagged reviews moderation |
| GET | `/admin/analytics/revenue` | JWT (admin) | Revenue breakdown by stream |
| GET | `/admin/analytics/listings` | JWT (admin) | Listing analytics |
| GET | `/admin/settings` | JWT (admin) | Platform config (fees, limits) |
| PATCH | `/admin/settings` | JWT (admin) | Update platform config |

---

## SECTION 4: CROSS-CUTTING CONCERNS

### Authentication & Authorization
- All routes use JWT Bearer tokens
- Access tokens: 15 min expiry
- Refresh tokens: 30 days, stored in HttpOnly cookie
- Role-based guards: `@Roles('admin')`, `@Roles('landlord')`, etc.
- Resource ownership guards: verify `req.user.id === resource.landlordId` before PATCH/DELETE

### Rate Limiting
- Public search endpoints: 60 req/min per IP
- Auth endpoints: 10 req/min per IP
- Authenticated endpoints: 300 req/min per user

### File Uploads
- All uploads go to Cloudinary via signed upload
- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max file size: 10MB per file
- Legal documents stored as PDF with AES-256 encryption at rest

### Notifications
- Push (mobile): Firebase Cloud Messaging (FCM) — device tokens on UserSchema
- Email: SMTP or SendGrid — triggered by: KYC status change, verification status change, document ready to sign, new enquiry, viewing confirmed
- SMS: Termii / AfricasTalking — OTP only

### Events / Queues (NestJS + BullMQ)
- `property.created` → trigger verification request creation
- `verification.approved` → activate listing + notify landlord + update ARI
- `payment.legal_doc.success` → generate PDF + notify both parties
- `rnpl.eligibility.result` → notify tenant
- `enquiry.submitted` → notify landlord + log enquiry count

### GPS Duplicate Detection Algorithm
```
On listing creation:
1. Query all active properties where coordinates are within 50m radius (MongoDB $nearSphere)
2. If match found: flag with warning, block submission unless admin override
3. Store coordinates as GeoJSON Point { type: 'Point', coordinates: [lng, lat] }
4. Index: 2dsphere on coordinates field
```

---

## SECTION 5: AI SYSTEM PROMPT FOR BUILDING THESE MODULES

---

```
SYSTEM PROMPT — House Me Backend (NestJS Microservices)
========================================================

You are a senior NestJS backend engineer building the "House Me" real estate platform backend — a verified, landlord-only rental marketplace for Nigeria.

TECH STACK:
- Framework: NestJS (latest stable) with microservices architecture
- Database: MongoDB with Mongoose ODM
- Language: TypeScript (strict mode)
- Auth: JWT (access + refresh tokens), BullMQ for queues, Passport.js
- Payments: Flutterwave (primary), Paystack (secondary)
- File storage: Cloudinary
- SMS/OTP: Termii
- Notifications: FCM (Firebase)
- Income verification: Mono API
- Geocoding: Google Maps API
- Testing: Jest + Supertest

ARCHITECTURE:
- Monorepo using Nx or NestJS native monorepo (apps/ + libs/)
- Each service is an independent NestJS app behind an API Gateway
- Services communicate internally via NestJS TCP transport
- External clients (web + mobile) communicate only with the Gateway over REST
- Gateway handles JWT verification, rate limiting, request routing
- Shared code lives in libs/common, libs/database, libs/events

CODING STANDARDS:
- All DTOs must use class-validator decorators for validation
- All schemas must use Mongoose @Schema() decorators with strict: true
- All controllers must have Swagger @ApiTags, @ApiOperation, @ApiResponse decorators
- All sensitive fields (BVN, NIN, monthly income) must be encrypted using AES-256 before storage
- Use @nestjs/config with .env validation via Joi
- All monetary values stored in kobo (smallest unit) as integers — never floats
- GeoJSON Point format for all coordinates: { type: 'Point', coordinates: [longitude, latitude] }
- All timestamps are UTC
- Use soft deletes (isDeleted: boolean, deletedAt: Date) — never hard delete

MODULE BUILDING INSTRUCTIONS:

When building each module, follow this structure:

1. Schema (schemas/entity-name.schema.ts):
   - Full Mongoose schema with all fields
   - Indexes defined inline (@index decorators or schema.index())
   - Virtual fields where needed
   - Pre/post hooks for computed fields

2. DTOs (dto/):
   - CreateEntityDto — all required fields for creation
   - UpdateEntityDto (extends PartialType(CreateEntityDto))
   - FilterEntityDto — query params for listing/search
   - ResponseEntityDto — what the API returns (exclude sensitive fields)

3. Repository (entity-name.repository.ts):
   - Wraps Mongoose model
   - All database queries live here, not in services
   - Methods: findById, findAll(filter), create, update, softDelete, count

4. Service (entity-name.service.ts):
   - Business logic only
   - Calls repository
   - Calls other services via inter-service TCP calls
   - Emits domain events to BullMQ

5. Controller (entity-name.controller.ts):
   - HTTP handlers only
   - Calls service
   - Transform responses with class-transformer
   - Guards: @UseGuards(JwtAuthGuard, RolesGuard)
   - Rate limiting: @Throttle()

6. Module (entity-name.module.ts):
   - Imports, providers, controllers, exports

ERROR HANDLING:
- All errors throw NestJS HttpException with consistent format:
  { statusCode, message, error, timestamp, path }
- Use global exception filter
- Log errors with NestJS Logger (not console.log)
- Payment webhook failures must be idempotent (check idempotency key before processing)

GPS/LOCATION:
- All coordinates stored as GeoJSON: { type: 'Point', coordinates: [lng, lat] }
- Ensure 2dsphere indexes on coordinate fields
- Duplicate detection: query $nearSphere within 50 metres on property submission
- Field verifier check-in: compute Haversine distance between verifier GPS and property GPS; must be < 30 metres

SECURITY:
- BVN and NIN: encrypt with AES-256-GCM before storage; decrypt only in admin context
- Legal document PDFs: stored on Cloudinary with signed URLs (60-minute expiry)
- Document hash: SHA-256 of PDF bytes stored on LegalDocument schema for tamper detection
- CORS: restrict to known origins in production
- Helmet middleware on gateway

NOW BUILD: Start with the module specified, following the above standards exactly. Output:
1. The schema file
2. All DTO files
3. The repository file
4. The service file
5. The controller file
6. The module file

Do not mock any logic. Implement fully with real Mongoose queries, real JWT guard implementations, and real Cloudinary/Flutterwave/Mono integrations using environment variables for credentials.
```

---

*Document version: 1.0 | House Me Backend Technical Reference | April 2026*
