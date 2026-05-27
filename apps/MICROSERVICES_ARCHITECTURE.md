# House Me Microservice Bootstrap

This folder bootstraps the backend architecture defined in `HouseMe_Backend_Technical.md`:

- `gateway`: external REST API entrypoint with Swagger docs
- `auth-service`: `AuthModule`, `UsersModule`
- `property-service`: `HousesModule`, `VerificationsModule`
- `financial-service`: `PromotionsModule` (RNPL/Subscriptions pending extraction)
- `comms-service`: `MessagesModule`, `ViewingsModule`, `AlertsModule`, `ReviewsModule`
- `analytics-service`: `AdminModule` (Area Rent Index pending)
- `legal-service`: scaffolded and ready for Legal Documents module
- `marketplace-service`: scaffolded and ready for Services Marketplace module

## Run services

From `backend`:

- `npm run start:gateway`
- `npm run start:auth-service`
- `npm run start:property-service`
- `npm run start:financial-service`
- `npm run start:comms-service`
- `npm run start:analytics-service`
- `npm run start:legal-service`
- `npm run start:marketplace-service`

## Current migration status

This commit introduces the service app entrypoints and module allocation so the backend can be split module-by-module without blocking existing flows.
