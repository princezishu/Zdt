# PROJECT MASTER HANDBOOK

- Generated from repository state on **2026-03-13 13:28:50** (UTC: 2026-03-13 07:58:50 UTC).
- Scope: frontend (`app`), backend (`server`), tooling (`tools`), docs/assets (`docs`, `images`).
- Language style: English with simple Hindi support lines.

## 1) Executive Snapshot

Hindi quick line: **Yeh section project ka fast overview deta hai.**

- Source files scanned (excluding `.git`, `node_modules`, binary uploads): **319**
- Backend route modules: **21**
- Canonical API endpoints (primary mounts): **248**
- All mounted endpoints including aliases: **564**
- Frontend app views defined: **97**
- Frontend route rules parsed: static **65**, dynamic **8**
- DB ensure groups: **12**
- SQL migration files: **22**
- Environment variables documented: app **10**, server **79**

## 2) Repository Scan Boundaries and Inputs

Hindi quick line: **Yeh batata hai handbook kis source se bana hai.**

- Primary source-of-truth files scanned:
  - `app/src/main.tsx`, `app/src/App.tsx`, `app/src/lib/*`, `app/src/sections/**/*`
  - `server/src/index.js`, middleware, services, jobs, controllers, routes
  - `server/src/db.js`, `server/sql/migrations/*`
  - `app/.env.example`, `server/.env.example`
  - `app/package.json`, `server/package.json`, `tools/pitch-deck/package.json`
- Skipped directories:
  - .git
  - .vscode
  - __pycache__
  - dist
  - node_modules
  - private_uploads
  - uploads
- Top-level scanned file counts:
  - app: 228
  - server: 78
  - docs: 7
  - tools: 4
  - PROJECT_MASTER_HANDBOOK.md: 1
  - TechSpec.md: 1

## 3) End-to-End Runtime Flow (Start to End)

Hindi quick line: **User request start se DB response tak ka pura flow yaha hai.**

- Frontend bootstraps in `app/src/main.tsx`: React StrictMode + root render + global toaster.
- Client-side view resolution runs in `app/src/App.tsx` using `viewFromPathname`, mapping URL -> `AppView` -> lazy-loaded section component.
- Auth/session state is managed by `app/src/lib/session.ts`; managed provider bridge is handled by `app/src/lib/supabase.ts`.
- All API calls go through `app/src/lib/http.ts` (`apiRequest`) which appends API version prefix, token, cookie credentials, and `X-Device-Id`.
- Backend entrypoint `server/src/index.js` configures security and transport middleware (`helmet`, CORS, request logging, compression, JSON limits, static uploads).
- Requests are routed to domain modules mounted on both legacy and versioned prefixes (for backward compatibility and `/api/v1` consistency).
- Route handlers validate input (mostly Zod), enforce auth/permission middleware, then call DB queries or domain services.
- DB layer is PostgreSQL via `pg` pool (`server/src/db.js`), with ensure-* bootstrap functions creating/maintaining schema at startup.
- Cross-cutting async behavior: cron schedulers, Redis/BullMQ queue (optional), analytics aggregation jobs, infra ingestion jobs.
- Realtime messaging is initialized through Socket.IO (`initializeChatRealtime`) on the same HTTP server.
- Errors are normalized in the global Express error middleware (Zod, PostgreSQL codes, generic fallback).
- Frontend receives JSON responses, updates state/UI, and (for chat) receives realtime events via socket subscriptions.

## 4) Frontend Architecture

Hindi quick line: **Frontend architecture modular hai, view-driven navigation ke saath.**

### 4.1 Entry and App Shell

- Entry: `app/src/main.tsx`
- Main shell + routing logic: `app/src/App.tsx`
- View contracts: `app/src/lib/views.ts`
- Header/Footer and major section components are lazy loaded for faster initial render.

### 4.2 Frontend View Routing Map

- Static path mappings parsed from `viewFromPathname`:
  - `/about` -> view `about` -> component `Suspense`
  - `/add-property` -> view `add-property` -> component `Suspense`
  - `/admin/group-deals` -> view `admin-group-deals` -> component `Suspense`
  - `/admin/infra/add` -> view `admin-infra-add` -> component `Suspense`
  - `/admin/infra/inbox` -> view `admin-infra-inbox` -> component `Suspense`
  - `/admin/infra/manage` -> view `admin-infra-manage` -> component `Suspense`
  - `/admin/infra/preview` -> view `admin-infra-inbox` -> component `Suspense`
  - `/admin/infra/subscribers` -> view `admin-infra-subscribers` -> component `Suspense`
  - `/apartment-complex` -> view `apartment-complex` -> component `Suspense`
  - `/blog` -> view `blog` -> component `Suspense`
  - `/builder/projects/new` -> view `builder-project-new` -> component `Suspense`
  - `/building-materials` -> view `building-materials` -> component `Suspense`
  - `/buy` -> view `buy` -> component `Suspense`
  - `/buy-details` -> view `buy` -> component `Suspense`
  - `/buy-map` -> view `buy-map` -> component `Suspense`
  - `/career` -> view `career` -> component `Suspense`
  - `/commercial` -> view `commercial` -> component `(component not resolved in App conditional block)`
  - `/company/login` -> view `company-login` -> component `(component not resolved in App conditional block)`
  - `/company/register` -> view `company-register` -> component `Suspense`
  - `/construct-with-us` -> view `construct-with-us` -> component `Suspense`
  - `/contact` -> view `contact` -> component `Suspense`
  - `/cookies` -> view `cookies` -> component `Suspense`
  - `/dealers-builders` -> view `dealers-builders` -> component `Suspense`
  - `/e-auction` -> view `e-auction` -> component `Suspense`
  - `/early-supporters` -> view `early-supporters` -> component `Suspense`
  - `/faq` -> view `faq` -> component `Suspense`
  - `/group-deals` -> view `group-deals` -> component `Suspense`
  - `/help-center` -> view `help-center` -> component `Suspense`
  - `/insights/compare` -> view `insights-compare` -> component `Suspense`
  - `/insights/market` -> view `insights-market` -> component `Suspense`
  - `/insights/news` -> view `insights-news` -> component `Suspense`
  - `/insights/projects` -> view `insights-projects` -> component `Suspense`
  - `/invest` -> view `invest` -> component `Suspense`
  - `/layout-units` -> view `layout-units-floor-detail` -> component `Suspense`
  - `/layout-units/builder` -> view `layout-units-builder` -> component `Suspense`
  - `/layout-units/units` -> view `layout-units-list` -> component `Suspense`
  - `/new-launch` -> view `new-launch` -> component `(component not resolved in App conditional block)`
  - `/owner/add-property` -> view `owner-add-property` -> component `Suspense`
  - `/owner/analytics` -> view `owner-analytics` -> component `Suspense`
  - `/owner/dashboard` -> view `owner-dashboard` -> component `Suspense`
  - `/owner/edit-property` -> view `owner-listings` -> component `Suspense`
  - `/owner/leads` -> view `owner-leads` -> component `Suspense`
  - `/owner/listings` -> view `owner-listings` -> component `Suspense`
  - `/owner/payments` -> view `owner-payments` -> component `Suspense`
  - `/owner/profile` -> view `owner-profile` -> component `Suspense`
  - `/owner/rentals` -> view `owner-rentals` -> component `Suspense`
  - `/owner/subscription` -> view `owner-subscription` -> component `Suspense`
  - `/plots-land` -> view `plots-land` -> component `(component not resolved in App conditional block)`
  - `/press` -> view `press` -> component `Suspense`
  - `/privacy` -> view `privacy` -> component `Suspense`
  - `/projects` -> view `projects` -> component `(component not resolved in App conditional block)`
  - `/property-details` -> view `property-details` -> component `Suspense`
  - `/rent` -> view `rent` -> component `Suspense`
  - `/rent-co-living` -> view `rent-co-living` -> component `Suspense`
  - `/rent-details` -> view `rent` -> component `Suspense`
  - `/rent-map` -> view `rent-map` -> component `Suspense`
  - `/rent-short-term` -> view `rent-short-term` -> component `Suspense`
  - `/rent/add` -> view `rent-property` -> component `Suspense`
  - `/saved` -> view `saved` -> component `Suspense`
  - `/saved-rentals` -> view `saved-rentals` -> component `Suspense`
  - `/security` -> view `security` -> component `Suspense`
  - `/sell` -> view `sell-property` -> component `Suspense`
  - `/sell/add` -> view `sell-property` -> component `Suspense`
  - `/terms` -> view `terms` -> component `Suspense`
  - `/unsubscribe` -> view `unsubscribe` -> component `Suspense`

- Dynamic path matchers parsed from `viewFromPathname`:
  - `/^\/admin\/infra\/preview\/([^/]+)$/` -> view `admin-infra-preview` -> component `Suspense`
  - `/^\/buy-details\/([^/]+)$/` -> view `buy-details` -> component `Suspense`
  - `/^\/dealers-builders\/(\d+)$/` -> view `dealers-builders-company` -> component `Suspense`
  - `/^\/group-deals\/([^/]+)$/` -> view `group-deal-details` -> component `Suspense`
  - `/^\/owner\/edit-property\/([^/]+)$/` -> view `owner-edit-property` -> component `Suspense`
  - `/^\/projects\/(\d+)$/` -> view `project-details` -> component `Suspense`
  - `/^\/property-details\/([^/]+)$/` -> view `property-details` -> component `Suspense`
  - `/^\/rent-details\/([^/]+)$/` -> view `rent-details` -> component `Suspense`

### 4.3 app/src/lib Module Inventory (Concept Used Where)

- `app/src/lib/aiChatbotApi.ts`
  - Concepts: AI Integration
  - Exports: askRealtyAi, AiChatRole, AiChatMessage, AiChatResponse
- `app/src/lib/amenities.ts`
  - Concepts: AI Integration, Analytics/Insights
  - Exports: DEFAULT_AMENITIES, DefaultAmenity
- `app/src/lib/apartmentComplexApi.ts`
  - Concepts: Authentication, AI Integration
  - Exports: listApartmentComplexBuildings, createApartmentBuilding, getApartmentBuildingDetails, updateApartmentRoomSold, deleteApartmentBuilding, sendApartmentRentAlert, generateBuildingRooms, updateApartmentRoom, deleteApartmentRoom, deleteApartmentRoomsBulk, markRoomPaid, markRoomUnpaid
- `app/src/lib/api.ts`
  - Concepts: Maps/Geo
  - Exports: API_BASE_URL
- `app/src/lib/compareStore.ts`
  - Concepts: Validation, AI Integration, Analytics/Insights
  - Exports: readComparedListings, readComparedIds, isCompared, upsertComparedListing, removeComparedListing, clearComparedListings, COMPARE_CHANGED_EVENT, ComparedListing
- `app/src/lib/favoritesStore.ts`
  - Concepts: Validation, AI Integration
  - Exports: readFavoriteListings, readFavoriteIds, isFavorite, upsertFavoriteListing, removeFavoriteListing, clearFavoriteListings, FAVORITES_CHANGED_EVENT, FavoriteListing
- `app/src/lib/featureUsageApi.ts`
  - Concepts: AI Integration, Notifications, Analytics/Insights
  - Exports: trackFeatureUsage, FeatureUsageKey
- `app/src/lib/geoApi.ts`
  - Concepts: Maps/Geo
  - Exports: getGeoStates, getGeoDistricts, getGeoSubdistricts, getGeoPlaces, GeoStateItem, GeoDistrictItem, GeoSubdistrictItem, GeoPlaceItem
- `app/src/lib/groupDealsApi.ts`
  - Concepts: Authentication, AI Integration, Maps/Geo
  - Exports: getGroupDeals, getGroupDealByCode, getPropertyGroupDeal, joinGroupDeal, createGroupDealRequest, adminGetGroupDeals, adminGetGroupDealRequests, adminCreateGroupDeal, adminUpdateGroupDeal, adminUpdateGroupDealRequest, adminApproveCreateGroupDealRequest, adminGetGroupDealJoins
- `app/src/lib/http.ts`
  - Concepts: Authentication, AI Integration
  - Exports: apiRequest, ApiError
- `app/src/lib/imageUpload.ts`
  - Concepts: AI Integration, Maps/Geo
  - Exports: cropAndOptimizeImageSource, optimizeImageFile, ImageOptimizeOptions, CropAreaPixels
- `app/src/lib/indiaLocationSelection.ts`
  - Concepts: Validation, Maps/Geo
  - Exports: readIndiaLocationSelection, writeIndiaLocationSelection, INDIA_LOCATION_SELECTION_KEY, IndiaLocationSelection
- `app/src/lib/infraIngestApi.ts`
  - Concepts: Authentication, AI Integration
  - Exports: getInfraIngestItems, ignoreInfraIngestItem, publishInfraIngestItem, InfraIngestStatus, InfraIngestPublishResult, InfraIngestItem, InfraIngestDupeItem, InfraIngestPublishPayload
- `app/src/lib/infrastructureApi.ts`
  - Concepts: Authentication, AI Integration, Maps/Geo
  - Exports: getInfraUpdates, getInfraUpdatesMeta, getInfraUpdatesMetaAll, getRecentVerifiedUpdates, getInfraUpdateById, getInfraUpdateSourceCheck, createInfraUpdate, updateInfraUpdate, deleteInfraUpdate, InfraUpdateCategory, InfraImpactLevel, InfraVerificationLevel
- `app/src/lib/infraSubscriptionsApi.ts`
  - Concepts: Authentication, AI Integration, Notifications
  - Exports: createInfraSubscription, unsubscribeInfraSubscription, getInfraSubscriptions, deleteInfraSubscription, InfraSubscriptionChannel, InfraSubscriptionItem
- `app/src/lib/insightsApi.ts`
  - Concepts: Authentication, Scheduler/Cron, AI Integration, Maps/Geo, Analytics/Insights
  - Exports: getInsightsNews, trackNewsArticleClick, getMarketTopCities, getMarketTrend, getMarketCompare, getMarketPlacePrice, getProjectAnnouncements, getProjectAnnouncementDetail, getAdminInsightsNewsSources, createAdminInsightsNewsSource, updateAdminInsightsNewsSource, runAdminNewsRefresh
- `app/src/lib/investmentSignalsApi.ts`
  - Concepts: Analytics/Insights
  - Exports: listLiveRealtyStockSignals, LiveRealtyStockSignal, LiveRealtyStockSignalsResponse
- `app/src/lib/investmentStore.ts`
  - Concepts: Authentication, Validation, AI Integration
  - Exports: getInvestmentSignalMode, setInvestmentSignalMode, listManualCompanySignals, createManualCompanySignal, removeManualCompanySignal, listBuilderInvestmentRequests, createBuilderInvestmentRequest, updateBuilderInvestmentRequestStatus, InvestmentSignalMode, ManualCompanySignal, BuilderInvestmentRequest
- `app/src/lib/layoutUnitsApi.ts`
  - Concepts: Authentication, File/Media Handling, AI Integration
  - Exports: listLayoutBuildings, listFloorsByBuilding, createFloor, uploadFloorLayout, getLatestFloorLayout, listUnits, createUnit, createUnitsBulk, updateUnit, upsertLayoutMarkers, listLayoutMarkers, UnitType
- `app/src/lib/materialsApi.ts`
  - Concepts: Authentication, AI Integration, Maps/Geo
  - Exports: getBuildingMaterials, getBuildingMaterialsMeta, updateMaterialItemPhoto, createMaterialItem, createCircularBuildRequest, getMyCircularBuildRequests, getAdminCircularBuildRequests, updateCircularBuildRequestStatus, MaterialSort, CircularBuildStatus, CircularBuildSellerType, MaterialItem
- `app/src/lib/mediaUploadApi.ts`
  - Concepts: Authentication, File/Media Handling, AI Integration, Maps/Geo
  - Exports: uploadImageDataUrl, uploadImageFile, PublicImageUploadPurpose
- `app/src/lib/notificationsStore.ts`
  - Concepts: Validation, AI Integration, Notifications, Analytics/Insights
  - Exports: readNotifications, addNotification, markNotificationRead, markAllNotificationsRead, clearNotifications, getUnreadNotificationCount, NOTIFICATIONS_CHANGED_EVENT, NotificationKind, NotificationItem
- `app/src/lib/portalData.ts`
  - Concepts: Authentication, AI Integration, Maps/Geo, Analytics/Insights
  - Exports: getPropertiesForCategory, findPropertyByReference, portalHeroSlides, continueBrowsingPills, portalProperties, PortalCategory, PortalHeroSlide, PortalProperty
- `app/src/lib/promotionsApi.ts`
  - Concepts: Authentication
  - Exports: getPublicPromotions, getAdminPromotions, createAdminPromotion, updateAdminPromotion, deleteAdminPromotion, PromotionType, PromotionItem, PublicPromotionsResponse, AdminPromotionsResponse, UpsertPromotionPayload, UpdatePromotionPayload
- `app/src/lib/propertyAnalyticsApi.ts`
  - Concepts: AI Integration, Analytics/Insights
  - Exports: trackPropertyInteraction, PropertyInteractionAction
- `app/src/lib/realtyApi.ts`
  - Concepts: Authentication, Database Access, AI Integration, Analytics/Insights
  - Exports: getBuilderMembership, listAmenities, listCompanies, getCompany, listCompanyProjects, listProjects, listCompanyProperties, createProject, getProject, updateProjectConstruction, createProjectConstructionUpdate, listProjectConstructionUpdates
- `app/src/lib/rentalsSavedStore.ts`
  - Concepts: Validation, AI Integration
  - Exports: readSavedRentals, isSavedRental, upsertSavedRental, removeSavedRental, SAVED_RENTALS_CHANGED_EVENT, SavedRental
- `app/src/lib/savedSearchStore.ts`
  - Concepts: Validation, AI Integration, Analytics/Insights
  - Exports: readSavedSearches, addSavedSearch, removeSavedSearch, clearSavedSearches, setPendingSavedSearch, consumePendingSavedSearch, SAVED_SEARCHES_CHANGED_EVENT, SavedSearch
- `app/src/lib/seo.ts`
  - Concepts: Maps/Geo
  - Exports: applySeo, buildCanonicalPath, SeoStructuredData, SeoConfig
- `app/src/lib/session.ts`
  - Concepts: Authentication, Authorization/RBAC, Validation, AI Integration
  - Exports: parseApiUser, saveSession, setSessionToken, clearSession, readToken, readStoredUser, readOrCreateDeviceId, UserRole, AuthUser
- `app/src/lib/share.ts`
  - Concepts: AI Integration
  - Exports: shareLink, ShareLinkInput
- `app/src/lib/slug.ts`
  - Concepts: AI Integration
  - Exports: slugifySegment, parseTrailingIdSegment, buildSlugIdSegment, buildCanonicalDetailPath
- `app/src/lib/supabase.ts`
  - Concepts: Authentication, Validation, AI Integration, Maps/Geo
  - Exports: isSupabaseConfigured, getSupabaseClient, readManagedLinkHint, setManagedLinkHint, clearManagedLinkHint, readManagedSignupHint, setManagedSignupHint, clearManagedSignupHint, getManagedSession, getManagedAccessToken, subscribeToManagedAuthChanges, signInWithManagedPassword
- `app/src/lib/supportProgramApi.ts`
  - Concepts: Authentication
  - Exports: getSupportProgramConfig, createSupportContribution, getAdminSupportContributions, updateSupportContributionStatus, CreateSupportContributionPayload, SupportContributionRecord, CreateSupportContributionResponse, SupportProgramConfigResponse, AdminSupportContributionsResponse, UpdateSupportContributionStatusPayload
- `app/src/lib/utils.ts`
  - Concepts: AI Integration
  - Exports: cn
- `app/src/lib/views.ts`
  - Concepts: Authentication, AI Integration, Notifications, Analytics/Insights
  - Exports: APP_VIEWS, AppView
- `app/src/lib/whatsapp.ts`
  - Concepts: Notifications
  - Exports: normalizePhoneDigits, resolveDefaultWhatsappNumber, buildWhatsAppLink, openWhatsApp, WhatsAppLinkInput
- `app/src/lib/workflowStore.ts`
  - Concepts: Validation, File/Media Handling, AI Integration
  - Exports: readWorkflowData, writeWorkflowData, createEntityId, createReferenceId, pushBuyerRequest, pushSellListing, pushRentListing, createHelpRequest, propertyTypeOptions, PropertyType, InteractionStatus, ListingApprovalStatus

### 4.4 Sections Directory Inventory

- Group `(root)` (52 files)
  - AboutPage.tsx
  - AddProperty.tsx
  - AdminDeskPage.tsx
  - AdminGroupDealsPage.tsx
  - AdminInfraAddPage.tsx
  - AdminInfraInboxPage.tsx
  - AdminInfraManagePage.tsx
  - AdminInfraPreviewPage.tsx
  - AdminInfraSubscribersPage.tsx
  - AIFeatures.tsx
  - BlogPage.tsx
  - BuyPage.tsx
  - CareerPage.tsx
  - Categories.tsx
  - ComparePage.tsx
  - ContactPage.tsx
  - CookiesPage.tsx
  - CTA.tsx
  - Dashboard.tsx
  - DealersBuildersPage.tsx
  - DeveloperPage.tsx
  - FaqPage.tsx
  - FavoritesPage.tsx
  - FeaturedProperties.tsx
  - Footer.tsx
  - ForgotPassword.tsx
  - GroupDealDetailPage.tsx
  - GroupDealsPage.tsx
  - Header.tsx
  - HelpCenterPage.tsx
  - Hero.tsx
  - InfrastructureTrackerPage.tsx
  - Login.tsx
  - MessagesPage.tsx
  - NotificationsPage.tsx
  - PressPage.tsx
  - PrivacyPage.tsx
  - ProfilePage.tsx
  - PropertyDetailsPage.tsx
  - PropertySearchPage.tsx
  - Register.tsx
  - RentPage.tsx
  - SavedSearchesPage.tsx
  - SecurityPage.tsx
  - SellPage.tsx
  - Services.tsx
  - Statistics.tsx
  - StrategicModulesPage.tsx
  - TeamAdminPage.tsx
  - TermsPage.tsx
  - Testimonials.tsx
  - UnsubscribePage.tsx
- Group `admin` (2 files)
  - admin/MainAdminPromotionsPanel.tsx
  - admin/SupportContributionsPanel.tsx
- Group `apartment-complex` (5 files)
  - apartment-complex/ApartmentComplexHome.tsx
  - apartment-complex/ApartmentComplexPage.tsx
  - apartment-complex/BuildingDetails.tsx
  - apartment-complex/CreateBuilding.tsx
  - apartment-complex/RoomHistoryModal.tsx
- Group `buy` (3 files)
  - buy/BuyMapPage.tsx
  - buy/BuyMarketplacePage.tsx
  - buy/BuyPropertyDetailsPage.tsx
- Group `dealers` (4 files)
  - dealers/CompanyProfilePage.tsx
  - dealers/DealersDirectoryPage.tsx
  - dealers/NewProjectPage.tsx
  - dealers/ProjectDetailsPage.tsx
- Group `eauction` (2 files)
  - eauction/EAuctionPage.module.scss
  - eauction/EAuctionPage.tsx
- Group `insights` (5 files)
  - insights/InsightsComparePage.tsx
  - insights/InsightsMarketPage.tsx
  - insights/InsightsNewsPage.tsx
  - insights/InsightsProjectsPage.tsx
  - insights/InsightsTabs.tsx
- Group `layout-units` (6 files)
  - layout-units/FloorDetailPage.tsx
  - layout-units/LayoutAIAssist.tsx
  - layout-units/LayoutUnitBuilderPage.tsx
  - layout-units/LayoutUnitsShell.tsx
  - layout-units/PaymentGatewayPlaceholder.tsx
  - layout-units/UnitsListPage.tsx
- Group `owner` (11 files)
  - owner/OwnerAddPropertyPage.tsx
  - owner/OwnerAnalyticsPage.tsx
  - owner/OwnerDashboardPage.tsx
  - owner/OwnerEditPropertyPage.tsx
  - owner/OwnerLeadsPage.tsx
  - owner/OwnerListingsPage.tsx
  - owner/OwnerPaymentsPage.tsx
  - owner/OwnerProfilePage.tsx
  - owner/OwnerPropertyForm.tsx
  - owner/OwnerRentalsPage.tsx
  - owner/OwnerSubscriptionPage.tsx
- Group `portal` (9 files)
  - portal/BuildingMaterialsPage.tsx
  - portal/ConstructWithUsPage.tsx
  - portal/EarlySupportersPage.tsx
  - portal/InvestPage.tsx
  - portal/MarketplaceListingsPage.tsx
  - portal/PortalHomePage.tsx
  - portal/PortalPropertyDetailsPage.tsx
  - portal/PostPropertyFlowPage.tsx
  - portal/PropertyListingCard.tsx
- Group `rent` (6 files)
  - rent/RentCoLivingPage.tsx
  - rent/RentDetailsPage.tsx
  - rent/RentMapPage.tsx
  - rent/RentMarketplacePage.tsx
  - rent/RentShortTermPage.tsx
  - rent/SavedRentalsPage.tsx
- Group `workflow` (1 files)
  - workflow/CommonBlocks.tsx

### 4.5 Frontend API Usage Map

- `app/src/lib/aiChatbotApi.ts`
  - /api/ai/chat
- `app/src/lib/apartmentComplexApi.ts`
  - /api/apartment-complex/buildings${suffix}
  - /api/apartment-complex/buildings
  - /api/apartment-complex/buildings/${buildingId}${suffix}
  - /api/apartment-complex/rooms/${roomId}/sold
  - /api/apartment-complex/buildings/${buildingId}
  - /api/apartment-complex/buildings/${buildingId}/rent-alert
  - /api/apartment-complex/buildings/${buildingId}/rooms/generate
  - /api/apartment-complex/rooms/${roomId}
  - /api/apartment-complex/rooms/delete-bulk
  - /api/apartment-complex/rooms/${roomId}/rent/mark-paid
  - /api/apartment-complex/rooms/${roomId}/rent/mark-unpaid
  - /api/apartment-complex/rooms/${roomId}/rent/history?limit=${limit}
- `app/src/lib/featureUsageApi.ts`
  - /workflow/public/feature-usage
- `app/src/lib/geoApi.ts`
  - /api/geo/states${buildQuery({
      q: params?.q?.trim() || undefined,
      limit: params?.limit,
      offset: params?.offset,
    })}
  - /api/geo/districts${buildQuery({
      stateCode: params.stateCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}
  - /api/geo/subdistricts${buildQuery({
      districtCode: params.districtCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}
  - /api/geo/places${buildQuery({
      subdistrictCode: params.subdistrictCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}
- `app/src/lib/groupDealsApi.ts`
  - /api/group-deals/property/${encodeURIComponent(String(propertyId))}
  - /api/group-deals/requests
  - /api/group-deals/admin/deals${buildQuery({
      status: params?.status,
      q: params?.q,
      page: params?.page,
      pageSize: params?.pageSize,
    })}
  - /api/group-deals/admin/requests${buildQuery({
      status: params?.status,
      q: params?.q,
      page: params?.page,
      pageSize: params?.pageSize,
    })}
  - /api/group-deals/admin/deals
  - /api/group-deals/admin/requests/${encodeURIComponent(String(requestId))}
  - /api/group-deals/admin/requests/${encodeURIComponent(String(requestId))}/approve-create-draft
- `app/src/lib/infraIngestApi.ts`
  - /api/infra-ingest${buildQuery({
      status: params.status || undefined,
      q: params.q?.trim() || undefined,
    })}
  - /api/infra-ingest/${id}/ignore
- `app/src/lib/infrastructureApi.ts`
  - /api/infra-updates/meta${buildQuery({
      state: params?.state,
      district: params?.district,
      q: params?.q,
    })}
  - /api/infra-updates/meta-all
  - /api/infra-updates/recent${buildQuery({
      state: params?.state,
      district: params?.district,
      city: params?.city,
      limit: params?.limit,
    })}
  - /api/infra-updates/by-id/${id}
  - /api/infra-updates/${id}/source-check
  - /api/infra-updates
  - /api/infra-updates/${id}
- `app/src/lib/infraSubscriptionsApi.ts`
  - /api/infra-subscriptions
  - /api/infra-subscriptions/unsubscribe
  - /api/infra-subscriptions${suffix}
  - /api/infra-subscriptions/${id}
- `app/src/lib/insightsApi.ts`
  - /api/insights/news${buildQuery(params || {})}
  - /api/insights/news/${articleId}/click
  - /api/insights/market/top-cities${buildQuery({ limit })}
  - /api/insights/market/trend${buildQuery({ city, limit })}
  - /api/insights/market/place-price${buildQuery({ place })}
  - /api/insights/projects/announcements${buildQuery(params || {})}
  - /api/insights/projects/announcements/${announcementId}
  - /api/admin/insights/news-sources
  - /api/admin/insights/news-sources/${id}
  - /api/admin/insights/run/news
  - /api/admin/insights/run/market
  - /api/admin/insights/builder-sources
  - /api/admin/insights/builder-sources/${id}
  - /api/admin/insights/run/projects
  - /api/admin/insights/job-runs${buildQuery({ limit })}
- `app/src/lib/investmentSignalsApi.ts`
  - /api/invest/realty-stock-signals?limit=${safeLimit}
- `app/src/lib/layoutUnitsApi.ts`
  - /api/buildings
  - /api/floors?buildingId=${buildingId}
  - /api/floors
  - /api/layout/upload
  - /api/layout/${floorId}/latest
  - /api/units${suffix}
  - /api/units
  - /api/units/bulk
  - /api/units/${unitId}
  - /api/layout/${payload.floorId}/markers
  - /api/layout/${floorId}/markers
- `app/src/lib/materialsApi.ts`
  - /api/materials/items${buildQuery(params || {})}
  - /api/materials/meta
  - /api/materials/admin/items/${itemId}/photo
  - /api/materials/admin/items
  - /api/materials/reuse-requests
  - /api/materials/reuse-requests/mine${buildQuery(params || {})}
  - /api/materials/admin/reuse-requests${buildQuery(params || {})}
  - /api/materials/admin/reuse-requests/${requestId}/status
- `app/src/lib/mediaUploadApi.ts`
  - /auth/media/upload-image
- `app/src/lib/promotionsApi.ts`
  - /api/promotions/public${buildQuery({ limitPerType })}
  - /api/promotions/admin/items${buildQuery(params || {})}
  - /api/promotions/admin/items
  - /api/promotions/admin/items/${promotionId}
- `app/src/lib/propertyAnalyticsApi.ts`
  - /workflow/public/listings/${encodeURIComponent(normalizedReference)}/interaction
- `app/src/lib/realtyApi.ts`
  - /builder/me
  - /realty/amenities
  - /realty/companies${suffix}
  - /realty/companies/${companyId}
  - /realty/companies/${companyId}/projects
  - /realty/projects${suffix}
  - /realty/companies/${companyId}/properties
  - /realty/projects
  - /realty/projects/${projectId}
  - /realty/projects/${projectId}/construction
  - /realty/projects/${projectId}/construction-updates
  - /realty/projects/${projectId}/construction-updates/manage?${params.toString()}
  - /realty/projects/${projectId}/construction-updates/${updateId}/review
  - /realty/properties
  - /realty/properties/${propertyId}
- `app/src/lib/supportProgramApi.ts`
  - /api/support/config
  - /api/support/contributions
  - /api/support/admin/contributions${suffix}
  - /api/support/admin/contributions/${contributionId}/status
- `app/src/sections/AdminDeskPage.tsx`
  - /workflow/admin/overview
  - /workflow/team/requests?type=all
  - /workflow/admin/team-members
  - /workflow/admin/platform-users
  - /workflow/main/career-applications?status=Pending
  - /workflow/main/activity-log?limit=120
  - /workflow/admin/requests/${requestId}/listing-status
  - /workflow/admin/requests/${requestId}/flag
  - /workflow/admin/requests/${requestId}/assign-team
  - /workflow/admin/requests/${item.id}/featured
  - /workflow/admin/team-members/${memberId}
  - /workflow/main/career-applications/${applicationId}/review
  - /workflow/admin/platform-users/${member.id}
  - /workflow/admin/platform-users/${member.id}/revoke-sessions
  - /workflow/main/promote-team/${member.id}
  - /workflow/main/accounts/${member.id}/reset-password
  - /workflow/main/system/emergency-control
  - /api/admin/promote-owner/${id}
  - /api/admin/promote-owner/${member.id}
- `app/src/sections/buy/BuyMapPage.tsx`
  - /api/properties?listingType=sale&${window.location.search.slice(1)}
- `app/src/sections/buy/BuyMarketplacePage.tsx`
  - /api/properties?${params.toString()}
- `app/src/sections/buy/BuyPropertyDetailsPage.tsx`
  - /api/properties/${propertyId}
  - /api/properties?listingType=sale&city=${encodeURIComponent(property.city)}&limit=3
  - /api/leads
- `app/src/sections/CareerPage.tsx`
  - /workflow/careers/availability
  - /workflow/careers/apply
- `app/src/sections/Dashboard.tsx`
  - /auth/profile
- `app/src/sections/DealersBuildersPage.tsx`
  - /builder/me
  - /builder/company/projects
  - /builder/company/banners
  - /builder/company/users
  - /builder/company/logo
  - /auth/login
  - /auth/company-access/request-otp
  - /auth/company-access/verify-otp
  - /builder/register-company
  - /builder/company/users/${workerId}
  - /builder/company/projects/${projectId}/approve
  - /builder/company/projects/${projectId}
  - /builder/company/banners/${bannerId}
- `app/src/sections/DeveloperPage.tsx`
  - /auth/me
- `app/src/sections/eauction/EAuctionPage.tsx`
  - /api/eauction/cards?${params.toString()}
  - /api/eauction/cards
  - /api/eauction/cards/${id}
- `app/src/sections/Footer.tsx`
  - /auth/newsletter/subscribe
- `app/src/sections/Hero.tsx`
  - https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1&accept-language=en
- `app/src/sections/Login.tsx`
  - /auth/me
  - /auth/managed/link
  - /auth/managed/link/recover
  - /auth/login/resend-2fa
  - /auth/login/verify-2fa
  - /auth/login
- `app/src/sections/MessagesPage.tsx`
  - /chat/conversations/${conversationId}/meta
  - /chat/conversations
  - /chat/conversations/${conversationId}/messages
  - /chat/conversations/team
  - /chat/conversations/owner
  - /chat/conversations/company
  - /chat/conversations/${activeConversationId}/messages
  - /chat/conversations/${activeConversationId}/messages/${messageId}
  - /chat/conversations/${targetConversationId}
- `app/src/sections/owner/OwnerAddPropertyPage.tsx`
  - /api/owner/properties
  - /api/rentals
- `app/src/sections/owner/OwnerAnalyticsPage.tsx`
  - /api/owner/analytics
- `app/src/sections/owner/OwnerDashboardPage.tsx`
  - /api/owner/analytics
- `app/src/sections/owner/OwnerEditPropertyPage.tsx`
  - /api/owner/properties/${propertyId}
- `app/src/sections/owner/OwnerLeadsPage.tsx`
  - /api/owner/leads?${params.toString()}
  - /api/owner/leads/${lead.id}
- `app/src/sections/owner/OwnerListingsPage.tsx`
  - /api/owner/properties
  - /api/owner/properties/${propertyId}
  - /api/owner/boost/${propertyId}
- `app/src/sections/owner/OwnerProfilePage.tsx`
  - /api/owner/profile
  - /auth/media/upload-image
- `app/src/sections/owner/OwnerRentalsPage.tsx`
  - /api/owner/rentals
  - /api/owner/boost/${rentalId}
  - /api/rentals/${rentalId}
  - /api/owner/rentals/${rental.id}/tenant-record
  - /api/owner/rentals/${rental.id}/rent-records
  - /api/owner/rentals/${rental.id}/send-notification
- `app/src/sections/owner/OwnerSubscriptionPage.tsx`
  - /api/owner/subscribe
- `app/src/sections/portal/InvestPage.tsx`
  - /realty/properties?listingType=sale&sort=recommended&limit=6
- `app/src/sections/portal/PortalHomePage.tsx`
  - /auth/profile
  - /chat/conversations/team
  - /chat/conversations/${conversationId}/messages
  - https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1&accept-language=en
- `app/src/sections/portal/PortalPropertyDetailsPage.tsx`
  - /workflow/public/listings/${encodeURIComponent(refKey)}
  - /workflow/public/schedule-visit
  - /workflow/public/report-fraud
- `app/src/sections/ProfilePage.tsx`
  - /auth/profile
  - /auth/profile/main-admin-media
  - /auth/profile/photo-upload
  - /auth/change-password
  - /auth/logout-all
  - /auth/managed/link
  - /auth/me
  - /auth/deactivate
  - /auth/profile/main-admin-media/${mediaId}
- `app/src/sections/PropertyDetailsPage.tsx`
  - /workflow/public/schedule-visit
  - /workflow/public/report-fraud
- `app/src/sections/Register.tsx`
  - /auth/me
  - /auth/register
- `app/src/sections/rent/RentCoLivingPage.tsx`
  - /api/rentals?rentalModel=co_living&sort=recommended&limit=24
- `app/src/sections/rent/RentDetailsPage.tsx`
  - /api/rentals/${rentalId}
  - /api/rentals?city=${encodeURIComponent(rental.city)}&limit=3
  - /api/rentals/leads
- `app/src/sections/rent/RentMapPage.tsx`
  - /api/rentals?${window.location.search.slice(1)}
- `app/src/sections/rent/RentMarketplacePage.tsx`
  - /api/rentals?${params.toString()}
- `app/src/sections/rent/RentShortTermPage.tsx`
  - /api/rentals?rentalModel=short_term&sort=recommended&limit=24
- `app/src/sections/rent/SavedRentalsPage.tsx`
  - /api/rentals/saved
  - /api/rentals/saved/${rentalId}
- `app/src/sections/RentPage.tsx`
  - /workflow/public/rent
- `app/src/sections/SellPage.tsx`
  - /workflow/public/sell
- `app/src/sections/TeamAdminPage.tsx`
  - /workflow/team/requests?${queryParams.toString()}
  - /workflow/team/requests/${id}
- `app/src/sections/workflow/CommonBlocks.tsx`
  - /workflow/public/phone-otp/request
  - /workflow/public/phone-otp/verify

## 5) Backend Architecture

Hindi quick line: **Backend domain-based routes + services pattern follow karta hai.**

- Core entry file: `server/src/index.js`
- Security middleware present: helmet=True, cors=True, compression=True
- Observability middleware present: morgan=True, /health route=True
- Reliability features: global error handler=True, cron=True, queue=True, realtime=True

### 5.1 Startup Ensure Order

- ensureAuthTables (29 tables)
- ensureBuilderCompanyTables (22 tables)
- ensureLayoutUnitTables (5 tables)
- ensureEAuctionTables (1 tables)
- ensureApartmentComplexTables (4 tables)
- ensureBuildingMaterialsTables (4 tables)
- ensureSitePromotionsTables (1 tables)
- ensureSupportProgramTables (1 tables)
- ensureOwnerTables (6 tables)
- ensureInsightsTables (7 tables)
- ensureInfrastructureTables (3 tables)
- ensureGroupDealsTables (3 tables)
- ensureInsightsSourceSeeds (0 tables)

### 5.2 Backend Module Inventory

- Controllers (1 files)
  - `server/src/controllers/layoutUnitsController.js` -> Authentication, Validation, Database Access, File/Media Handling, AI Integration
- Middleware (3 files)
  - `server/src/middleware/auditLogger.js` -> Database Access, AI Integration
  - `server/src/middleware/auth.js` -> Authentication, Authorization/RBAC, Database Access, AI Integration
  - `server/src/middleware/rateLimit.js` -> Rate Limiting, AI Integration
- Services (9 files)
  - `server/src/services/analytics/jobs.js` -> Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
  - `server/src/services/chatRealtime.js` -> Authentication, Realtime, Database Access, AI Integration
  - `server/src/services/indiaVillageDirectory.js` -> Authentication, AI Integration
  - `server/src/services/insights/helpers.js` -> Authentication, Validation, File/Media Handling, AI Integration, Analytics/Insights
  - `server/src/services/insights/jobs.js` -> Authentication, Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
  - `server/src/services/insights/queries.js` -> Authentication, Scheduler/Cron, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
  - `server/src/services/managedAuth.js` -> Authentication, Authorization/RBAC, Database Access, AI Integration
  - `server/src/services/otpDelivery.js` -> Authentication, AI Integration, Notifications
  - `server/src/services/queue/index.js` -> Queue/Async Jobs, Scheduler/Cron, AI Integration, Notifications, Analytics/Insights
- Jobs (2 files)
  - `server/src/jobs/infraIngest.js` -> Rate Limiting, Queue/Async Jobs, Scheduler/Cron, Database Access, AI Integration, Maps/Geo
  - `server/src/jobs/pibIngest.js` -> Database Access, AI Integration
- Utils (5 files)
  - `server/src/utils/env.js` -> General
  - `server/src/utils/fetchWithRetry.js` -> Rate Limiting, AI Integration
  - `server/src/utils/fileValidation.js` -> File/Media Handling
  - `server/src/utils/groupDealAuto.js` -> Database Access, AI Integration
  - `server/src/utils/passwordPolicy.js` -> Authentication, AI Integration

### 5.3 Route Module Architecture

- `aiAssistant` | file `server/src/routes/aiAssistant.js` | mounts: /api/ai, /api/v1/ai | canonical endpoints: 1
- `apartmentComplex` | file `server/src/routes/apartmentComplex.js` | mounts: /api/apartment-complex, /api/v1/apartment-complex | canonical endpoints: 15
- `auth` | file `server/src/routes/auth.js` | mounts: /auth, /api/v1/auth | canonical endpoints: 26
- `builder` | file `server/src/routes/builder.js` | mounts: /builder, /api/v1/builder | canonical endpoints: 15
- `chat` | file `server/src/routes/chat.js` | mounts: /chat, /api/v1/chat | canonical endpoints: 10
- `eauction` | file `server/src/routes/eauction.js` | mounts: /api/eauction, /api/v1/eauction | canonical endpoints: 3
- `groupDeals` | file `server/src/routes/groupDeals.js` | mounts: /api, /api/v1 | canonical endpoints: 12
- `infraIngest` | file `server/src/routes/infraIngest.js` | mounts: /api, /api/v1 | canonical endpoints: 3
- `infraSubscriptions` | file `server/src/routes/infraSubscriptions.js` | mounts: /api, /api/v1 | canonical endpoints: 4
- `infraUpdates` | file `server/src/routes/infraUpdates.js` | mounts: /api, /api/v1 | canonical endpoints: 9
- `insights` | file `server/src/routes/insights.js` | mounts: /api, /api/v1 | canonical endpoints: 18
- `investSignals` | file `server/src/routes/investSignals.js` | mounts: /api, /api/v1 | canonical endpoints: 1
- `layoutUnits` | file `server/src/routes/layoutUnits.js` | mounts: /api, /api/v1 | canonical endpoints: 11
- `locations` | file `server/src/routes/locations.js` | mounts: /api, /api/v1 | canonical endpoints: 6
- `materials` | file `server/src/routes/materials.js` | mounts: /api/materials, /api/v1/materials | canonical endpoints: 8
- `owner` | file `server/src/routes/owner.js` | mounts: /api/owner, /api/v1/owner | canonical endpoints: 18
- `promotions` | file `server/src/routes/promotions.js` | mounts: /api/promotions, /api/v1/promotions | canonical endpoints: 5
- `realty` | file `server/src/routes/realty.js` | mounts: /api, /api/v1, /realty, /api/v1/realty | canonical endpoints: 34
- `rentals` | file `server/src/routes/rentals.js` | mounts: /api/rentals, /api/v1/rentals | canonical endpoints: 12
- `support` | file `server/src/routes/support.js` | mounts: /api/support, /api/v1/support | canonical endpoints: 4
- `workflow` | file `server/src/routes/workflow.js` | mounts: /workflow, /api/v1/workflow | canonical endpoints: 33

## 6) Full API Catalog (Grouped by Domain)

Hindi quick line: **Is section mein saare API endpoints domain-wise listed hain.**

### 6.aiAssistant Ai Assistant

- Source file: `server/src/routes/aiAssistant.js`
- Primary mount: `/api/v1/ai`
- All mounts: `/api/ai`, `/api/v1/ai`
- Alias mounts: `/api/ai`
- Canonical endpoint count: 1
  - POST `/api/v1/ai/chat`

### 6.apartmentComplex Apartment Complex

- Source file: `server/src/routes/apartmentComplex.js`
- Primary mount: `/api/v1/apartment-complex`
- All mounts: `/api/apartment-complex`, `/api/v1/apartment-complex`
- Alias mounts: `/api/apartment-complex`
- Canonical endpoint count: 15
  - GET `/api/v1/apartment-complex/buildings`
  - POST `/api/v1/apartment-complex/buildings`
  - DELETE `/api/v1/apartment-complex/buildings/:id`
  - GET `/api/v1/apartment-complex/buildings/:id`
  - POST `/api/v1/apartment-complex/buildings/:id/rent-alert`
  - POST `/api/v1/apartment-complex/buildings/:id/rooms/generate`
  - PATCH `/api/v1/apartment-complex/buildings/:id/sold`
  - GET `/api/v1/apartment-complex/meta`
  - DELETE `/api/v1/apartment-complex/rooms/:roomId`
  - PUT `/api/v1/apartment-complex/rooms/:roomId`
  - GET `/api/v1/apartment-complex/rooms/:roomId/rent/history`
  - POST `/api/v1/apartment-complex/rooms/:roomId/rent/mark-paid`
  - POST `/api/v1/apartment-complex/rooms/:roomId/rent/mark-unpaid`
  - PATCH `/api/v1/apartment-complex/rooms/:roomId/sold`
  - POST `/api/v1/apartment-complex/rooms/delete-bulk`

### 6.auth Auth

- Source file: `server/src/routes/auth.js`
- Primary mount: `/api/v1/auth`
- All mounts: `/auth`, `/api/v1/auth`
- Alias mounts: `/auth`
- Canonical endpoint count: 26
  - GET `/api/v1/auth/activity`
  - POST `/api/v1/auth/change-password`
  - POST `/api/v1/auth/company-access/request-otp`
  - POST `/api/v1/auth/company-access/verify-otp`
  - POST `/api/v1/auth/deactivate`
  - POST `/api/v1/auth/forgot-password/request`
  - POST `/api/v1/auth/forgot-password/reset`
  - POST `/api/v1/auth/login`
  - POST `/api/v1/auth/login/resend-2fa`
  - POST `/api/v1/auth/login/verify-2fa`
  - POST `/api/v1/auth/logout`
  - POST `/api/v1/auth/logout-all`
  - POST `/api/v1/auth/managed/link`
  - POST `/api/v1/auth/managed/link/recover`
  - GET `/api/v1/auth/me`
  - GET `/api/v1/auth/media/signed`
  - POST `/api/v1/auth/media/upload-image`
  - POST `/api/v1/auth/newsletter/subscribe`
  - GET `/api/v1/auth/profile`
  - PATCH `/api/v1/auth/profile`
  - GET `/api/v1/auth/profile/main-admin-media`
  - POST `/api/v1/auth/profile/main-admin-media`
  - DELETE `/api/v1/auth/profile/main-admin-media/:id`
  - POST `/api/v1/auth/profile/photo-upload`
  - POST `/api/v1/auth/register`
  - GET `/api/v1/auth/sessions`

### 6.builder Builder

- Source file: `server/src/routes/builder.js`
- Primary mount: `/api/v1/builder`
- All mounts: `/builder`, `/api/v1/builder`
- Alias mounts: `/builder`
- Canonical endpoint count: 15
  - GET `/api/v1/builder/banners`
  - GET `/api/v1/builder/company/banners`
  - POST `/api/v1/builder/company/banners`
  - DELETE `/api/v1/builder/company/banners/:id`
  - PATCH `/api/v1/builder/company/banners/:id`
  - POST `/api/v1/builder/company/logo`
  - GET `/api/v1/builder/company/projects`
  - POST `/api/v1/builder/company/projects`
  - DELETE `/api/v1/builder/company/projects/:id`
  - PATCH `/api/v1/builder/company/projects/:id/approve`
  - GET `/api/v1/builder/company/users`
  - POST `/api/v1/builder/company/users`
  - DELETE `/api/v1/builder/company/users/:id`
  - GET `/api/v1/builder/me`
  - POST `/api/v1/builder/register-company`

### 6.chat Chat

- Source file: `server/src/routes/chat.js`
- Primary mount: `/api/v1/chat`
- All mounts: `/chat`, `/api/v1/chat`
- Alias mounts: `/chat`
- Canonical endpoint count: 10
  - GET `/api/v1/chat/conversations`
  - DELETE `/api/v1/chat/conversations/:id`
  - GET `/api/v1/chat/conversations/:id/messages`
  - POST `/api/v1/chat/conversations/:id/messages`
  - DELETE `/api/v1/chat/conversations/:id/messages/:messageId`
  - PATCH `/api/v1/chat/conversations/:id/meta`
  - PATCH `/api/v1/chat/conversations/:id/status`
  - POST `/api/v1/chat/conversations/company`
  - POST `/api/v1/chat/conversations/owner`
  - POST `/api/v1/chat/conversations/team`

### 6.eauction Eauction

- Source file: `server/src/routes/eauction.js`
- Primary mount: `/api/v1/eauction`
- All mounts: `/api/eauction`, `/api/v1/eauction`
- Alias mounts: `/api/eauction`
- Canonical endpoint count: 3
  - GET `/api/v1/eauction/cards`
  - POST `/api/v1/eauction/cards`
  - DELETE `/api/v1/eauction/cards/:id`

### 6.groupDeals Group Deals

- Source file: `server/src/routes/groupDeals.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 12
  - GET `/api/v1/group-deals`
  - GET `/api/v1/group-deals/:dealCode`
  - POST `/api/v1/group-deals/:dealCode/join`
  - GET `/api/v1/group-deals/admin/deals`
  - POST `/api/v1/group-deals/admin/deals`
  - PATCH `/api/v1/group-deals/admin/deals/:dealCode`
  - GET `/api/v1/group-deals/admin/deals/:dealCode/joins`
  - GET `/api/v1/group-deals/admin/requests`
  - PATCH `/api/v1/group-deals/admin/requests/:requestId`
  - POST `/api/v1/group-deals/admin/requests/:requestId/approve-create-draft`
  - GET `/api/v1/group-deals/property/:propertyId`
  - POST `/api/v1/group-deals/requests`

### 6.infraIngest Infra Ingest

- Source file: `server/src/routes/infraIngest.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 3
  - GET `/api/v1/infra-ingest`
  - POST `/api/v1/infra-ingest/:id/ignore`
  - POST `/api/v1/infra-ingest/:id/publish`

### 6.infraSubscriptions Infra Subscriptions

- Source file: `server/src/routes/infraSubscriptions.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 4
  - GET `/api/v1/infra-subscriptions`
  - POST `/api/v1/infra-subscriptions`
  - DELETE `/api/v1/infra-subscriptions/:id`
  - POST `/api/v1/infra-subscriptions/unsubscribe`

### 6.infraUpdates Infra Updates

- Source file: `server/src/routes/infraUpdates.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 9
  - GET `/api/v1/infra-updates`
  - POST `/api/v1/infra-updates`
  - DELETE `/api/v1/infra-updates/:id`
  - PUT `/api/v1/infra-updates/:id`
  - GET `/api/v1/infra-updates/:id/source-check`
  - GET `/api/v1/infra-updates/by-id/:id`
  - GET `/api/v1/infra-updates/meta`
  - GET `/api/v1/infra-updates/meta-all`
  - GET `/api/v1/infra-updates/recent`

### 6.insights Insights

- Source file: `server/src/routes/insights.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 18
  - GET `/api/v1/admin/insights/builder-sources`
  - POST `/api/v1/admin/insights/builder-sources`
  - PUT `/api/v1/admin/insights/builder-sources/:id`
  - GET `/api/v1/admin/insights/job-runs`
  - GET `/api/v1/admin/insights/news-sources`
  - POST `/api/v1/admin/insights/news-sources`
  - PUT `/api/v1/admin/insights/news-sources/:id`
  - POST `/api/v1/admin/insights/run/market`
  - POST `/api/v1/admin/insights/run/news`
  - POST `/api/v1/admin/insights/run/projects`
  - GET `/api/v1/insights/market/compare`
  - GET `/api/v1/insights/market/place-price`
  - GET `/api/v1/insights/market/top-cities`
  - GET `/api/v1/insights/market/trend`
  - GET `/api/v1/insights/news`
  - POST `/api/v1/insights/news/:id/click`
  - GET `/api/v1/insights/projects/announcements`
  - GET `/api/v1/insights/projects/announcements/:id`

### 6.investSignals Invest Signals

- Source file: `server/src/routes/investSignals.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 1
  - GET `/api/v1/invest/realty-stock-signals`

### 6.layoutUnits Layout Units

- Source file: `server/src/routes/layoutUnits.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 11
  - GET `/api/v1/buildings`
  - GET `/api/v1/floors`
  - POST `/api/v1/floors`
  - GET `/api/v1/layout/:floorId/latest`
  - GET `/api/v1/layout/:floorId/markers`
  - POST `/api/v1/layout/:floorId/markers`
  - POST `/api/v1/layout/upload`
  - GET `/api/v1/units`
  - POST `/api/v1/units`
  - PUT `/api/v1/units/:id`
  - POST `/api/v1/units/bulk`

### 6.locations Locations

- Source file: `server/src/routes/locations.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`
- Alias mounts: `/api`
- Canonical endpoint count: 6
  - GET `/api/v1/geo/districts`
  - GET `/api/v1/geo/places`
  - GET `/api/v1/geo/states`
  - GET `/api/v1/geo/subdistricts`
  - GET `/api/v1/locations/india-suggest`
  - GET `/api/v1/locations/india-suggest/status`

### 6.materials Materials

- Source file: `server/src/routes/materials.js`
- Primary mount: `/api/v1/materials`
- All mounts: `/api/materials`, `/api/v1/materials`
- Alias mounts: `/api/materials`
- Canonical endpoint count: 8
  - POST `/api/v1/materials/admin/items`
  - PUT `/api/v1/materials/admin/items/:id/photo`
  - GET `/api/v1/materials/admin/reuse-requests`
  - PATCH `/api/v1/materials/admin/reuse-requests/:id/status`
  - GET `/api/v1/materials/items`
  - GET `/api/v1/materials/meta`
  - POST `/api/v1/materials/reuse-requests`
  - GET `/api/v1/materials/reuse-requests/mine`

### 6.owner Owner

- Source file: `server/src/routes/owner.js`
- Primary mount: `/api/v1/owner`
- All mounts: `/api/owner`, `/api/v1/owner`
- Alias mounts: `/api/owner`
- Canonical endpoint count: 18
  - GET `/api/v1/owner/analytics`
  - POST `/api/v1/owner/boost/:id`
  - GET `/api/v1/owner/leads`
  - PUT `/api/v1/owner/leads/:id`
  - GET `/api/v1/owner/profile`
  - PUT `/api/v1/owner/profile`
  - GET `/api/v1/owner/properties`
  - POST `/api/v1/owner/properties`
  - DELETE `/api/v1/owner/properties/:id`
  - GET `/api/v1/owner/properties/:id`
  - PUT `/api/v1/owner/properties/:id`
  - GET `/api/v1/owner/rentals`
  - GET `/api/v1/owner/rentals/:id/rent-records`
  - POST `/api/v1/owner/rentals/:id/rent-records`
  - POST `/api/v1/owner/rentals/:id/send-notification`
  - GET `/api/v1/owner/rentals/:id/tenant-record`
  - PUT `/api/v1/owner/rentals/:id/tenant-record`
  - POST `/api/v1/owner/subscribe`

### 6.promotions Promotions

- Source file: `server/src/routes/promotions.js`
- Primary mount: `/api/v1/promotions`
- All mounts: `/api/promotions`, `/api/v1/promotions`
- Alias mounts: `/api/promotions`
- Canonical endpoint count: 5
  - GET `/api/v1/promotions/admin/items`
  - POST `/api/v1/promotions/admin/items`
  - DELETE `/api/v1/promotions/admin/items/:id`
  - PUT `/api/v1/promotions/admin/items/:id`
  - GET `/api/v1/promotions/public`

### 6.realty Realty

- Source file: `server/src/routes/realty.js`
- Primary mount: `/api/v1`
- All mounts: `/api`, `/api/v1`, `/realty`, `/api/v1/realty`
- Alias mounts: `/api`, `/realty`, `/api/v1/realty`
- Canonical endpoint count: 34
  - GET `/api/v1/admin/analytics`
  - PUT `/api/v1/admin/approve/:propertyId`
  - GET `/api/v1/admin/commission`
  - PUT `/api/v1/admin/promote-owner/:userId`
  - PUT `/api/v1/admin/reject/:propertyId`
  - GET `/api/v1/amenities`
  - POST `/api/v1/amenities`
  - GET `/api/v1/companies`
  - POST `/api/v1/companies`
  - GET `/api/v1/companies/:companyId`
  - PATCH `/api/v1/companies/:companyId`
  - GET `/api/v1/companies/:companyId/projects`
  - GET `/api/v1/companies/:companyId/properties`
  - GET `/api/v1/companies/:companyId/verification-documents`
  - POST `/api/v1/companies/:companyId/verification-documents`
  - PATCH `/api/v1/companies/:companyId/verify`
  - POST `/api/v1/leads`
  - GET `/api/v1/projects`
  - POST `/api/v1/projects`
  - GET `/api/v1/projects/:projectId`
  - PATCH `/api/v1/projects/:projectId/construction`
  - GET `/api/v1/projects/:projectId/construction-updates`
  - POST `/api/v1/projects/:projectId/construction-updates`
  - PATCH `/api/v1/projects/:projectId/construction-updates/:updateId/review`
  - GET `/api/v1/projects/:projectId/construction-updates/manage`
  - GET `/api/v1/properties`
  - POST `/api/v1/properties`
  - DELETE `/api/v1/properties/:propertyId`
  - GET `/api/v1/properties/:propertyId`
  - PUT `/api/v1/properties/:propertyId`
  - GET `/api/v1/saved`
  - DELETE `/api/v1/saved/:propertyId`
  - POST `/api/v1/saved/:propertyId`
  - PATCH `/api/v1/verification-documents/:documentId/review`

### 6.rentals Rentals

- Source file: `server/src/routes/rentals.js`
- Primary mount: `/api/v1/rentals`
- All mounts: `/api/rentals`, `/api/v1/rentals`
- Alias mounts: `/api/rentals`
- Canonical endpoint count: 12
  - GET `/api/v1/rentals`
  - POST `/api/v1/rentals`
  - DELETE `/api/v1/rentals/:id`
  - GET `/api/v1/rentals/:id`
  - PUT `/api/v1/rentals/:id`
  - PUT `/api/v1/rentals/admin/approve-rental/:id`
  - GET `/api/v1/rentals/admin/rental-analytics`
  - POST `/api/v1/rentals/book`
  - POST `/api/v1/rentals/leads`
  - GET `/api/v1/rentals/saved`
  - DELETE `/api/v1/rentals/saved/:rentalId`
  - POST `/api/v1/rentals/saved/:rentalId`

### 6.support Support

- Source file: `server/src/routes/support.js`
- Primary mount: `/api/v1/support`
- All mounts: `/api/support`, `/api/v1/support`
- Alias mounts: `/api/support`
- Canonical endpoint count: 4
  - GET `/api/v1/support/admin/contributions`
  - PATCH `/api/v1/support/admin/contributions/:id/status`
  - GET `/api/v1/support/config`
  - POST `/api/v1/support/contributions`

### 6.workflow Workflow

- Source file: `server/src/routes/workflow.js`
- Primary mount: `/api/v1/workflow`
- All mounts: `/workflow`, `/api/v1/workflow`
- Alias mounts: `/workflow`
- Canonical endpoint count: 33
  - GET `/api/v1/workflow/admin/overview`
  - GET `/api/v1/workflow/admin/platform-users`
  - PATCH `/api/v1/workflow/admin/platform-users/:id`
  - POST `/api/v1/workflow/admin/platform-users/:id/revoke-sessions`
  - PATCH `/api/v1/workflow/admin/requests/:id/assign-team`
  - PATCH `/api/v1/workflow/admin/requests/:id/featured`
  - PATCH `/api/v1/workflow/admin/requests/:id/flag`
  - PATCH `/api/v1/workflow/admin/requests/:id/listing-status`
  - GET `/api/v1/workflow/admin/team-members`
  - PATCH `/api/v1/workflow/admin/team-members/:id`
  - POST `/api/v1/workflow/careers/apply`
  - GET `/api/v1/workflow/careers/availability`
  - POST `/api/v1/workflow/main/accounts/:id/reset-password`
  - GET `/api/v1/workflow/main/activity-log`
  - GET `/api/v1/workflow/main/career-applications`
  - PATCH `/api/v1/workflow/main/career-applications/:id/review`
  - POST `/api/v1/workflow/main/promote-team/:id`
  - POST `/api/v1/workflow/main/system/emergency-control`
  - GET `/api/v1/workflow/my/submissions`
  - POST `/api/v1/workflow/my/submissions/:id/boost`
  - POST `/api/v1/workflow/public/buy`
  - POST `/api/v1/workflow/public/feature-usage`
  - GET `/api/v1/workflow/public/listings`
  - GET `/api/v1/workflow/public/listings/:referenceId`
  - POST `/api/v1/workflow/public/listings/:referenceId/interaction`
  - POST `/api/v1/workflow/public/phone-otp/request`
  - POST `/api/v1/workflow/public/phone-otp/verify`
  - POST `/api/v1/workflow/public/rent`
  - POST `/api/v1/workflow/public/report-fraud`
  - POST `/api/v1/workflow/public/schedule-visit`
  - POST `/api/v1/workflow/public/sell`
  - GET `/api/v1/workflow/team/requests`
  - PATCH `/api/v1/workflow/team/requests/:id`

## 7) Database Schema and Migration Evolution

Hindi quick line: **Database ka schema group-wise aur migration timeline yaha diya hai.**

### 7.1 ensure* Function -> Table Groups

- `ensureApartmentComplexTables` (4 tables)
  - buildings
  - rooms
  - rent_payments
  - apartment_rent_auto_alerts
- `ensureAuthTables` (29 tables)
  - users
  - password_reset_otps
  - login_2fa_challenges
  - user_sessions
  - user_profiles
  - main_admin_profile_media
  - property_requests
  - phone_verification_otps
  - property_request_status_history
  - career_applications
  - career_application_status_history
  - activity_logs
  - audit_logs
  - roles
  - permissions
  - role_permissions
  - user_roles
  - subscription_plans
  - plan_features
  - subscriptions
  - listing_analytics_events
  - property_price_history
  - property_analytics_daily
  - user_analytics
  - lead_analytics
  - user_favorite_listings
  - chat_conversations
  - chat_messages
  - chat_message_receipts
- `ensureBuilderCompanyTables` (22 tables)
  - builder_companies
  - builder_projects
  - builder_company_banners
  - companies
  - builder_verification_documents
  - projects
  - project_construction_updates
  - properties
  - amenities
  - project_amenities
  - property_amenities
  - rentals
  - rental_amenities
  - rental_property_amenities
  - rental_leads
  - rental_bookings
  - saved_rentals
  - saved_properties
  - leads
  - commission
  - listing_promotions
  - property_price_history_market
- `ensureBuildingMaterialsTables` (4 tables)
  - material_vendors
  - material_items
  - material_reuse_requests
  - material_reuse_request_events
- `ensureEAuctionTables` (1 tables)
  - eauction_sources
- `ensureGroupDealsTables` (3 tables)
  - group_deals
  - group_deal_joins
  - group_deal_requests
- `ensureInfrastructureTables` (3 tables)
  - infra_updates
  - infra_subscriptions
  - infra_ingest_items
- `ensureInsightsTables` (7 tables)
  - news_sources
  - news_articles
  - news_clicks
  - market_city_prices
  - builder_sources
  - project_announcements
  - job_runs
- `ensureLayoutUnitTables` (5 tables)
  - floors
  - layout_files
  - units
  - unit_amenities
  - layout_markers
- `ensureOwnerTables` (6 tables)
  - owner_profiles
  - subscriptions
  - boosts
  - rental_tenant_records
  - rental_payment_records
  - rental_notification_logs
- `ensureSitePromotionsTables` (1 tables)
  - site_promotions
- `ensureSupportProgramTables` (1 tables)
  - support_contributions

### 7.2 Migration Timeline (`server/sql/migrations`)

- 2026-02-14 | `20260214_create_eauction_sources.sql` | Create Eauction Sources
  - Creates: eauction_sources
  - Alters: eauction_sources
- 2026-02-15 | `20260215_add_floorwise_rooms_to_apartment_complex.sql` | Add Floorwise Rooms To Apartment Complex
  - Alters: rooms
- 2026-02-15 | `20260215_create_apartment_complex_module.sql` | Create Apartment Complex Module
  - Creates: buildings, rooms, rent_payments
  - Alters: buildings, rooms, rent_payments
- 2026-02-15 | `20260215_create_insights_module.sql` | Create Insights Module
  - Creates: news_sources, news_articles, news_clicks, market_city_prices, builder_sources, project_announcements, job_runs
  - Alters: builder_sources, market_city_prices, job_runs
- 2026-02-15 | `20260215_create_layout_units_module.sql` | Create Layout Units Module
  - Creates: floors, layout_files, units, unit_amenities, layout_markers
  - Alters: layout_files, units, layout_markers
- 2026-02-15 | `20260215_create_site_promotions.sql` | Create Site Promotions
  - Creates: site_promotions
  - Alters: site_promotions
- 2026-02-15 | `20260215_update_eauction_direct_links.sql` | Update Eauction Direct Links
- 2026-02-18 | `20260218_rbac_user_roles_phase1.sql` | Rbac User Roles Phase1
  - Creates: roles, permissions, role_permissions, user_roles
  - Alters: roles, permissions, role_permissions, user_roles
- 2026-02-18 | `20260218_uuid_phase3_backfill_bridge_core.sql` | Uuid Phase3 Backfill Bridge Core
  - Alters: password_reset_otps, user_sessions, property_requests, subscriptions, listing_analytics_events, chat_conversations, chat_messages, users, user_profiles, main_admin_profile_media, property_request_status_history, career_applications, career_application_status_history, activity_logs, audit_logs, property_price_history, property_analytics_daily, user_analytics, lead_analytics, user_favorite_listings
- 2026-02-18 | `20260218_uuid_phase3_contract_core.sql` | Uuid Phase3 Contract Core
  - Alters: users, property_requests, chat_conversations, user_sessions, subscriptions, listing_analytics_events, chat_messages
- 2026-02-18 | `20260218_uuid_phase3_expand_core.sql` | Uuid Phase3 Expand Core
  - Alters: users, password_reset_otps, user_sessions, user_profiles, main_admin_profile_media, property_requests, property_request_status_history, career_applications, career_application_status_history, activity_logs, audit_logs, subscriptions, listing_analytics_events, property_price_history, property_analytics_daily, user_analytics, lead_analytics, user_favorite_listings, chat_conversations, chat_messages
- 2026-02-18 | `20260218_uuid_phase3_rollback_bridge_core.sql` | Uuid Phase3 Rollback Bridge Core
  - Alters: password_reset_otps, user_sessions, property_requests, subscriptions, listing_analytics_events, chat_conversations, chat_messages
- 2026-02-22 | `20260222_alter_infra_ingest_content_hash.sql` | Alter Infra Ingest Content Hash
  - Alters: infra_ingest_items
- 2026-02-22 | `20260222_alter_infra_ingest_publish_tracking.sql` | Alter Infra Ingest Publish Tracking
  - Alters: infra_ingest_items
- 2026-02-22 | `20260222_alter_infra_subscriptions_all_india.sql` | Alter Infra Subscriptions All India
  - Alters: infra_subscriptions
- 2026-02-22 | `20260222_alter_infra_updates_admin_features.sql` | Alter Infra Updates Admin Features
  - Alters: infra_updates
- 2026-02-22 | `20260222_alter_infra_updates_indexes_and_trust.sql` | Alter Infra Updates Indexes And Trust
- 2026-02-22 | `20260222_alter_infra_updates_source_only_visibility.sql` | Alter Infra Updates Source Only Visibility
  - Alters: infra_updates
- 2026-02-22 | `20260222_create_infra_subscriptions_and_ingest.sql` | Create Infra Subscriptions And Ingest
  - Creates: infra_subscriptions, infra_ingest_items
- 2026-02-22 | `20260222_create_infra_updates.sql` | Create Infra Updates
  - Creates: infra_updates
- 2026-03-09 | `20260309_add_managed_auth_to_users.sql` | Add Managed Auth To Users
  - Alters: users
- n/a | `README_UUID_PHASE3.md` | Readme Uuid Phase3

## 8) Environment and Config Map

Hindi quick line: **Secrets expose kiye bina env purpose document kiya gaya hai.**

### 8.1 Frontend Env (`app/.env.example`)

- Frontend (Vite)
  - `VITE_API_URL` = `http://localhost:5000` -> API base URL and API versioning.
  - `VITE_API_VERSION_PREFIX` = `/api/v1` -> API base URL and API versioning.
  - `VITE_SITE_URL` = `https://example.com` -> Configuration toggle or default runtime value.
  - `VITE_SUPABASE_URL` = `` -> Supabase managed authentication configuration.
  - `VITE_SUPABASE_ANON_KEY` = `` -> Supabase managed authentication configuration.
  - `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL` = `http://localhost:5173/forgot-password?recovery=1` -> Supabase managed authentication configuration.
  - `VITE_GOOGLE_MAPS_API_KEY` = `your_google_maps_api_key` -> Google Maps client key.
  - `VITE_WHATSAPP_NUMBER` = `8217037667` -> WhatsApp contact or prefilled message settings.
  - `VITE_SUPPORT_UPI_QR_URL` = `` -> Configuration toggle or default runtime value.
  - `VITE_CONSTRUCTION_WHATSAPP_TEXT` = `Hi ZDT Realty, I want to start my construction journey.` -> WhatsApp contact or prefilled message settings.

### 8.2 Server Env (`server/.env.example`)

- AI and Market Data
  - `MARKET_API_PROVIDER` = `` -> Insights market provider (optional)
  - `MARKET_API_KEY` = `` -> Optional market data provider credentials.
  - `MARKET_API_URL` = `` -> API base URL and API versioning.
  - `OPENAI_API_KEY` = `` -> AI real-estate chatbot (optional)
  - `OPENAI_CHAT_MODEL` = `gpt-4o-mini` -> AI assistant model/provider configuration.
  - `GEMINI_API_KEY` = `your_gemini_api_key` -> AI assistant model/provider configuration.
  - `GEMINI_MODEL` = `gemini-1.5-flash` -> AI assistant model/provider configuration.
- Apartment Automation
  - `APARTMENT_RENT_LATE_PENALTY_PERCENT` = `5` -> Apartment rent alerts and penalties.
- Communication (Email/SMS)
  - `SMTP_HOST` = `smtp.gmail.com` -> Email OTP + Newsletter (SMTP sender)
  - `SMTP_PORT` = `587` -> SMTP transport for email OTP/newsletter.
  - `SMTP_SECURE` = `false` -> SMTP transport for email OTP/newsletter.
  - `SMTP_USER` = `your_smtp_username` -> SMTP transport for email OTP/newsletter.
  - `SMTP_PASS` = `your_smtp_password_or_app_password` -> SMTP transport for email OTP/newsletter.
  - `SMTP_FROM` = `ZDT Realty <support@zdtrealty.com>` -> SMTP transport for email OTP/newsletter.
  - `TWILIO_ACCOUNT_SID` = `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` -> SMS OTP (Twilio)
  - `TWILIO_AUTH_TOKEN` = `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` -> Twilio SMS OTP delivery.
  - `TWILIO_PHONE_NUMBER` = `+15551234567` -> Twilio SMS OTP delivery.
- Database
  - `DB_HOST` = `localhost` -> PostgreSQL connection and TLS settings.
  - `DB_USER` = `postgres` -> PostgreSQL connection and TLS settings.
  - `DB_PASS` = `your_db_password` -> PostgreSQL connection and TLS settings.
  - `DB_NAME` = `zdt_realty` -> PostgreSQL connection and TLS settings.
  - `DB_PORT` = `5432` -> PostgreSQL connection and TLS settings.
  - `DB_SSL` = `true` -> Keep true in production for managed PostgreSQL over TLS.
  - `DB_SSL_REJECT_UNAUTHORIZED` = `true` -> Keep true in production unless your DB provider requires otherwise.
  - `DB_SSL_CA` = `` -> Optional PEM CA certificate string; use \n for line breaks. Some providers require this CA bundle for TLS validation.
- General
  - `APP_NAME` = `ZDT Realty` -> Configuration toggle or default runtime value.
  - `AUTH_AUTO_REVOKE_OLDEST_SESSION_ON_LIMIT` = `true` -> Configuration toggle or default runtime value.
  - `MAIN_ADMIN_NAME` = `ZDT Realty Owner` -> Configuration toggle or default runtime value.
  - `MAIN_ADMIN_EMAIL` = `admin@example.com` -> Configuration toggle or default runtime value.
  - `MAIN_ADMIN_PASSWORD` = `ChangeThisStrongPassword123!` -> Configuration toggle or default runtime value.
  - `MAIN_ADMIN_PHONE` = `+910000000000` -> Configuration toggle or default runtime value.
  - `SUPPORT_UPI_QR_URL` = `` -> Configuration toggle or default runtime value.
  - `ENABLE_INGEST_JOBS` = `false` -> Infrastructure ingest scheduling and source controls.
  - `INDIA_VILLAGE_DATA_PATH` = `data/village-directory.csv` -> Configuration toggle or default runtime value.
  - `INDIA_VILLAGE_DATA_ZIP_URL` = `https://raw.githubusercontent.com/planemad/india-local-government-directory/m...` -> Configuration toggle or default runtime value.
- Infrastructure Ingest
  - `INFRA_PIB_RSS_FEEDS` = `PIB_REG_1|https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1,PIB_REG_2|ht...` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_PIB_MAX_FEEDS` = `20` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_PIB_REQUEST_RETRIES` = `4` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_PIB_ATTEMPTS_PER_FEED` = `3` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_PIB_ATTEMPT_DELAY_MS` = `1500` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_PIB_FEED_DELAY_MS` = `1200` -> Delay between PIB feeds (helps reduce transient resets on pib.gov.in)
  - `INFRA_PIB_LOG_RETRIES` = `false` -> Set true to log every retry attempt; false logs only final outcome per feed.
  - `INFRA_PIB_TRANSIENT_COOLDOWN_MINUTES` = `30` -> Cooldown for a PIB feed after transient failures to avoid repetitive log noise.
  - `INFRA_PIB_TIMEOUT_MS` = `25000` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_ENABLE_TENDER_SOURCES` = `false` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_SOURCE_REQUEST_RETRIES` = `2` -> Retry count for non-PIB sources (eTenders/eProcure/PPP).
  - `INFRA_SOURCE_TIMEOUT_MS` = `25000` -> Timeout for non-PIB sources.
  - `INFRA_SOURCE_TRANSIENT_COOLDOWN_MINUTES` = `30` -> Cooldown after transient source failures to prevent repetitive error logs.
  - `INFRA_ETENDERS_URLS` = `ETENDERS_MAIN|https://etenders.gov.in/eprocure/app` -> Comma-separated KEY|URL pairs, e.g. ETENDERS_NHAI|https://etenders.gov.in/eprocure/app,ETENDERS_MAIN|https://etenders.gov.in/eprocure/app Set to DISABLED to skip this source type.
  - `INFRA_EPROCURE_URLS` = `EPROCURE_MAIN|https://eprocure.gov.in/eprocure/app` -> Comma-separated KEY|URL pairs, e.g. EPROCURE_MORTH|https://eprocure.gov.in/eprocure/app,EPROCURE_MAIN|https://eprocure.gov.in/eprocure/app Set to DISABLED to skip this source type.
  - `INFRA_PPP_URLS` = `PPPINDIA_MAIN|https://www.pppinindia.gov.in/all_infrastructure_projects` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_INGEST_MAX_ITEMS_PER_SOURCE` = `200` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_INGEST_VERBOSE` = `false` -> Set true for extra ingest diagnostics (source-disabled messages, etc.)
  - `INFRA_INGEST_ORG_FILTERS` = `` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_INGEST_CLASS_FILTERS` = `` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_INGEST_LOCATION_FILTERS` = `` -> Infrastructure ingest scheduling and source controls.
  - `INFRA_INGEST_CLOSING_DATE_FROM` = `` -> Infrastructure ingest scheduling and source controls.
- Managed Auth
  - `MANAGED_AUTH_PROVIDER` = `` -> Managed auth transition (optional)
  - `MANAGED_AUTH_AUTO_LINK_BY_EMAIL` = `false` -> Keep false initially. When true, verified managed identities with matching emails auto-link.
- Managed Auth (Supabase)
  - `SUPABASE_PROJECT_URL` = `` -> Supabase managed authentication configuration.
  - `SUPABASE_JWT_ISSUER` = `` -> Optional override. Defaults to ${SUPABASE_PROJECT_URL}/auth/v1 when project URL is set.
  - `SUPABASE_JWKS_URL` = `` -> Optional override. Defaults to ${SUPABASE_JWT_ISSUER}/.well-known/jwks.json.
  - `SUPABASE_JWT_AUDIENCE` = `` -> Optional audience validation for asymmetric JWT projects.
  - `SUPABASE_ANON_KEY` = `` -> Required only when Supabase access tokens are signed with HS256.
- Media and Uploads
  - `MEDIA_SIGNING_SECRET` = `replace_with_strong_media_signing_secret` -> Signed media URLs and upload root.
  - `MEDIA_SIGNED_URL_TTL_SECONDS` = `900` -> Signed media URLs and upload root.
  - `PRIVATE_UPLOADS_ROOT` = `` -> Signed media URLs and upload root.
- Queue and Rate Limit
  - `ENABLE_REDIS_QUEUE` = `false` -> Optional. Leave false for local development unless Redis server version is >= 5.0.0. When REDIS_URL is set, the same Redis instance is also used for distributed API rate limiting.
  - `REDIS_URL` = `redis://127.0.0.1:6379` -> Redis queue and distributed rate limiting.
  - `REDIS_PING_TIMEOUT_MS` = `5000` -> BullMQ requires Redis server version >= 5.0.0 when ENABLE_REDIS_QUEUE=true.
  - `RATE_LIMIT_REDIS_URL` = `` -> Redis queue and distributed rate limiting.
  - `RATE_LIMIT_REDIS_TIMEOUT_MS` = `3000` -> Redis queue and distributed rate limiting.
- Server Core/Security
  - `JWT_SECRET` = `replace_with_strong_random_secret` -> JWT signing secret.
  - `PORT` = `5000` -> Configuration toggle or default runtime value.
  - `HOST` = `0.0.0.0` -> Configuration toggle or default runtime value.
  - `CORS_ORIGIN` = `http://localhost:5173,http://127.0.0.1:5173` -> Allowed frontend origins.
  - `TRUST_PROXY` = `1` -> Set trusted proxy hops (1 is common behind a single reverse proxy/load balancer). Use `true` only when every inbound request passes through trusted proxy infrastructure.
  - `FORCE_HTTPS` = `true` -> Keep true in production when TLS terminates at reverse proxy/load balancer.
  - `ADMIN_TOKEN` = `replace_with_a_long_random_admin_token` -> Bootstrap admin token.

## 9) Technology Used Where and Why

Hindi quick line: **Tech stack ko workspace aur use-case ke hisaab se map kiya gaya hai.**

### 9.app app

- Runtime dependencies:
  - Frontend Runtime: `react`, `react-dom`
    - Why here: UI rendering and component lifecycle.
  - Managed Auth: `@supabase/supabase-js`
    - Why here: Supabase identity integration.
  - Maps: `@react-google-maps/api`
    - Why here: Google Maps embedding and controls.
  - Realtime: `socket.io-client`
    - Why here: Bidirectional websocket-style communication.
  - Routing: `react-router-dom`
    - Why here: Declarative client-side navigation.
  - Styling: `tailwind-merge`
    - Why here: Utility-first styling pipeline.
  - UI Primitives: `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`
    - Why here: Accessible headless components.
  - Utility: `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `input-otp`, `lucide-react`, `next-themes`, `react-day-picker`, `react-easy-crop`, `react-resizable-panels`, `sonner`, `vaul`
    - Why here: General-purpose helper library.
  - Validation and Forms: `@hookform/resolvers`, `react-hook-form`, `zod`
    - Why here: Schema-driven input validation.
  - Visualization and Motion: `@gsap/react`, `embla-carousel-react`, `gsap`, `recharts`
    - Why here: Charts, carousels, and animation.
- Dev dependencies:
  - Build Tooling: `@vitejs/plugin-react`, `vite`
    - Why here: Dev server and production build.
  - Styling: `autoprefixer`, `postcss`, `tailwindcss`, `tailwindcss-animate`
    - Why here: Utility-first styling pipeline.
  - Type System: `typescript`
    - Why here: Static typing for maintainability.
  - Utility: `@eslint/js`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `kimi-plugin-inspect-react`, `png-to-ico`, `sass`, `sharp`, `tw-animate-css`, `typescript-eslint`
    - Why here: General-purpose helper library.

### 9.server server

- Runtime dependencies:
  - Backend HTTP: `express`
    - Why here: REST server and middleware composition.
  - Communication: `nodemailer`
    - Why here: Email and SMS delivery.
  - Database: `pg`
    - Why here: PostgreSQL driver.
  - HTTP Security/Perf: `compression`, `cors`, `helmet`, `morgan`
    - Why here: Headers, CORS, compression, request logs.
  - Ingestion/HTTP: `fast-xml-parser`, `rss-parser`, `undici`
    - Why here: External feed parsing and robust fetch.
  - Queueing: `bullmq`, `ioredis`
    - Why here: Redis-backed background jobs.
  - Realtime: `socket.io`
    - Why here: Bidirectional websocket-style communication.
  - Scheduling: `node-cron`
    - Why here: Cron-based recurring tasks.
  - Security/Auth: `bcryptjs`, `jose`, `jsonwebtoken`
    - Why here: JWT verification and password hashing.
  - Uploads: `multer`
    - Why here: Multipart file handling.
  - Utility: `dotenv`
    - Why here: General-purpose helper library.
  - Validation and Forms: `zod`
    - Why here: Schema-driven input validation.
- Dev dependencies:
  - Utility: `nodemon`
    - Why here: General-purpose helper library.

### 9.tools/pitch-deck tools/pitch-deck

- Runtime dependencies:
  - Automation: `playwright`
    - Why here: Headless browser screenshots and rendering.
  - Presentation Export: `pptxgenjs`
    - Why here: Programmatic pitch deck generation.

## 10) Security, Auth, Rate Limit, Queue, Scheduler, Realtime

Hindi quick line: **Core non-functional architecture controls yaha summarized hain.**

- Auth + Session: `server/src/middleware/auth.js`, `app/src/lib/session.ts`, `app/src/lib/supabase.ts`
- RBAC: `requireRole`, `requirePermission`, DB role/permission tables in `server/src/db.js`
- Validation: Zod schemas in route modules + centralized Zod error formatting in `server/src/index.js`
- Rate Limiting: `server/src/middleware/rateLimit.js` with Redis-backed and in-memory fallback modes
- Queueing: `server/src/services/queue/index.js` with BullMQ + Redis version checks and inline fallback
- Scheduling: `node-cron` jobs in `server/src/index.js` + analytics/insights and ingest jobs
- Realtime Chat: `server/src/services/chatRealtime.js` + `app/src/sections/MessagesPage.tsx` socket client
- Transport Security: Helmet, CORS allowlist, HTTPS enforcement, strict security headers

## 11) External Services Integration Map

Hindi quick line: **External providers kaha use hue hain, yeh clear mapping yaha hai.**

- Supabase
  - Why used: Managed identity provider for login/password reset/OAuth bridge.
  - Env keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_URL`, `SUPABASE_JWKS_URL`
  - Where referenced:
    - `app/src/App.tsx`
    - `app/src/lib/session.ts`
    - `app/src/lib/supabase.ts`
    - `app/src/sections/ForgotPassword.tsx`
    - `app/src/sections/Login.tsx`
    - `app/src/sections/ProfilePage.tsx`
    - `app/src/sections/Register.tsx`
    - `server/src/db.js`
    - `server/src/middleware/auth.js`
    - `server/src/routes/auth.js`
    - `server/src/services/chatRealtime.js`
    - `server/src/services/managedAuth.js`
- Google Maps
  - Why used: Map rendering and location-based property discovery.
  - Env keys: `VITE_GOOGLE_MAPS_API_KEY`
  - Where referenced:
    - `app/src/components/maps/ListingMap.tsx`
    - `app/src/sections/buy/BuyMapPage.tsx`
    - `app/src/sections/rent/RentMapPage.tsx`
    - `app/.env.example`
    - `app/dist/assets/BuyMapPage-DWDD_QBs.js`
    - `app/dist/assets/ListingMap-CH-PkHuu.js`
    - `app/dist/assets/maps-F5kIeJiM.js`
    - `app/dist/assets/RentMapPage-B-q44dzJ.js`
    - `app/node_modules/.vite/deps/@react-google-maps_api.js`
    - `app/node_modules/@googlemaps/js-api-loader/dist/index.d.ts`
    - `app/node_modules/@googlemaps/js-api-loader/dist/index.dev.js`
    - `app/node_modules/@googlemaps/js-api-loader/dist/index.min.js`
- OpenAI
  - Why used: Primary LLM response path for AI assistant route.
  - Env keys: `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`
  - Where referenced:
    - `server/src/routes/aiAssistant.js`
    - `app/node_modules/.vite/deps/@supabase_supabase-js.js`
    - `app/node_modules/@supabase/functions-js/src/edge-runtime.d.ts`
    - `app/node_modules/@supabase/storage-js/src/packages/StorageVectorsClient.ts`
    - `server/.env.example`
    - `server/src/routes/aiAssistant.js`
- Gemini
  - Why used: Fallback/alternative LLM provider for AI assistant route.
  - Env keys: `GEMINI_API_KEY`, `GEMINI_MODEL`
  - Where referenced:
    - `server/src/routes/aiAssistant.js`
    - `server/.env.example`
    - `server/src/routes/aiAssistant.js`
- Twilio
  - Why used: SMS OTP delivery for auth flows.
  - Env keys: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
  - Where referenced:
    - `app/src/App.tsx`
    - `app/src/components/ui/input-otp.tsx`
    - `app/src/lib/supabase.ts`
    - `app/src/sections/AddProperty.tsx`
    - `app/src/sections/apartment-complex/BuildingDetails.tsx`
    - `app/src/sections/DealersBuildersPage.tsx`
    - `app/src/sections/ForgotPassword.tsx`
    - `app/src/sections/Login.tsx`
    - `app/src/sections/portal/BuildingMaterialsPage.tsx`
    - `app/src/sections/portal/PortalPropertyDetailsPage.tsx`
    - `app/src/sections/PressPage.tsx`
    - `app/src/sections/ProfilePage.tsx`
- SMTP/Nodemailer
  - Why used: Email OTP and newsletter dispatch.
  - Env keys: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - Where referenced:
    - `app/src/App.tsx`
    - `app/src/lib/groupDealsApi.ts`
    - `app/src/lib/infraSubscriptionsApi.ts`
    - `app/src/lib/investmentStore.ts`
    - `app/src/lib/materialsApi.ts`
    - `app/src/lib/realtyApi.ts`
    - `app/src/lib/session.ts`
    - `app/src/lib/supabase.ts`
    - `app/src/sections/AdminDeskPage.tsx`
    - `app/src/sections/AdminGroupDealsPage.tsx`
    - `app/src/sections/AdminInfraSubscribersPage.tsx`
    - `app/src/sections/buy/BuyMarketplacePage.tsx`
- NSE
  - Why used: Live realty stock signal feed for invest section.
  - Env keys: (none required in env example or hardcoded external feed URLs)
  - Where referenced:
    - `app/src/lib/investmentSignalsApi.ts`
    - `server/src/routes/investSignals.js`
    - `app/dist/assets/InvestPage-ByPtJV-y.js`
    - `app/src/lib/investmentSignalsApi.ts`
    - `server/src/routes/investSignals.js`
- OSM/Nominatim
  - Why used: Reverse geocoding for location suggestion enrichment.
  - Env keys: (none required in env example or hardcoded external feed URLs)
  - Where referenced:
    - `app/src/sections/Hero.tsx`
    - `app/src/sections/portal/PortalHomePage.tsx`
    - `server/src/services/insights/queries.js`
    - `app/dist/assets/PortalHomePage-LcscMeqx.js`
    - `app/src/sections/Hero.tsx`
    - `app/src/sections/portal/PortalHomePage.tsx`
    - `server/src/services/insights/queries.js`

## 12) Concept Used Where (Module-wise)

Hindi quick line: **Agar interview mein pooche concept kaha hai, is matrix se turant answer de sakte ho.**

- `app/src/lib/aiChatbotApi.ts` -> AI Integration
- `app/src/lib/amenities.ts` -> AI Integration, Analytics/Insights
- `app/src/lib/apartmentComplexApi.ts` -> Authentication, AI Integration
- `app/src/lib/api.ts` -> Maps/Geo
- `app/src/lib/compareStore.ts` -> Validation, AI Integration, Analytics/Insights
- `app/src/lib/favoritesStore.ts` -> Validation, AI Integration
- `app/src/lib/featureUsageApi.ts` -> AI Integration, Notifications, Analytics/Insights
- `app/src/lib/geoApi.ts` -> Maps/Geo
- `app/src/lib/groupDealsApi.ts` -> Authentication, AI Integration, Maps/Geo
- `app/src/lib/http.ts` -> Authentication, AI Integration
- `app/src/lib/imageUpload.ts` -> AI Integration, Maps/Geo
- `app/src/lib/indiaLocationSelection.ts` -> Validation, Maps/Geo
- `app/src/lib/infraIngestApi.ts` -> Authentication, AI Integration
- `app/src/lib/infrastructureApi.ts` -> Authentication, AI Integration, Maps/Geo
- `app/src/lib/infraSubscriptionsApi.ts` -> Authentication, AI Integration, Notifications
- `app/src/lib/insightsApi.ts` -> Authentication, Scheduler/Cron, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/lib/investmentSignalsApi.ts` -> Analytics/Insights
- `app/src/lib/investmentStore.ts` -> Authentication, Validation, AI Integration
- `app/src/lib/layoutUnitsApi.ts` -> Authentication, File/Media Handling, AI Integration
- `app/src/lib/materialsApi.ts` -> Authentication, AI Integration, Maps/Geo
- `app/src/lib/mediaUploadApi.ts` -> Authentication, File/Media Handling, AI Integration, Maps/Geo
- `app/src/lib/notificationsStore.ts` -> Validation, AI Integration, Notifications, Analytics/Insights
- `app/src/lib/portalData.ts` -> Authentication, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/lib/promotionsApi.ts` -> Authentication
- `app/src/lib/propertyAnalyticsApi.ts` -> AI Integration, Analytics/Insights
- `app/src/lib/realtyApi.ts` -> Authentication, Database Access, AI Integration, Analytics/Insights
- `app/src/lib/rentalsSavedStore.ts` -> Validation, AI Integration
- `app/src/lib/savedSearchStore.ts` -> Validation, AI Integration, Analytics/Insights
- `app/src/lib/seo.ts` -> Maps/Geo
- `app/src/lib/session.ts` -> Authentication, Authorization/RBAC, Validation, AI Integration
- `app/src/lib/share.ts` -> AI Integration
- `app/src/lib/slug.ts` -> AI Integration
- `app/src/lib/supabase.ts` -> Authentication, Validation, AI Integration, Maps/Geo
- `app/src/lib/supportProgramApi.ts` -> Authentication
- `app/src/lib/utils.ts` -> AI Integration
- `app/src/lib/views.ts` -> Authentication, AI Integration, Notifications, Analytics/Insights
- `app/src/lib/whatsapp.ts` -> Notifications
- `app/src/lib/workflowStore.ts` -> Validation, File/Media Handling, AI Integration
- `app/src/sections/AboutPage.tsx` -> Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/AddProperty.tsx` -> Authentication, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/admin/MainAdminPromotionsPanel.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration
- `app/src/sections/admin/SupportContributionsPanel.tsx` -> Authentication, Database Access, AI Integration
- `app/src/sections/AdminDeskPage.tsx` -> Authentication, Validation, Queue/Async Jobs, Scheduler/Cron, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/AdminGroupDealsPage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/AdminInfraAddPage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/AdminInfraInboxPage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/AdminInfraManagePage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/AdminInfraPreviewPage.tsx` -> Database Access, AI Integration, Maps/Geo
- `app/src/sections/AdminInfraSubscribersPage.tsx` -> Authentication, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/AIFeatures.tsx` -> File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/apartment-complex/ApartmentComplexHome.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/apartment-complex/ApartmentComplexPage.tsx` -> Authentication, AI Integration, Analytics/Insights
- `app/src/sections/apartment-complex/BuildingDetails.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/apartment-complex/CreateBuilding.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/apartment-complex/RoomHistoryModal.tsx` -> Authentication, AI Integration, Analytics/Insights
- `app/src/sections/BlogPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/buy/BuyMapPage.tsx` -> AI Integration, Maps/Geo
- `app/src/sections/buy/BuyMarketplacePage.tsx` -> Authentication, Validation, Database Access, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/buy/BuyPropertyDetailsPage.tsx` -> Authentication, Validation, Database Access, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/BuyPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/CareerPage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Categories.tsx` -> AI Integration
- `app/src/sections/ComparePage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/ContactPage.tsx` -> File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/CookiesPage.tsx` -> Authentication, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/CTA.tsx` -> AI Integration
- `app/src/sections/Dashboard.tsx` -> Authentication, AI Integration, Notifications, Analytics/Insights
- `app/src/sections/dealers/CompanyProfilePage.tsx` -> Authentication, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/dealers/DealersDirectoryPage.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/dealers/NewProjectPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/dealers/ProjectDetailsPage.tsx` -> Authentication, Queue/Async Jobs, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/DealersBuildersPage.tsx` -> Authentication, Queue/Async Jobs, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/DeveloperPage.tsx` -> Authentication, AI Integration, Notifications, Analytics/Insights
- `app/src/sections/eauction/EAuctionPage.tsx` -> Authentication, AI Integration
- `app/src/sections/FaqPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/FavoritesPage.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/FeaturedProperties.tsx` -> AI Integration, Maps/Geo
- `app/src/sections/Footer.tsx` -> Database Access, AI Integration, Notifications, Analytics/Insights
- `app/src/sections/ForgotPassword.tsx` -> Authentication, Database Access, AI Integration, Analytics/Insights
- `app/src/sections/GroupDealDetailPage.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/GroupDealsPage.tsx` -> Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Header.tsx` -> Authentication, Scheduler/Cron, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/HelpCenterPage.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Hero.tsx` -> AI Integration, Maps/Geo
- `app/src/sections/InfrastructureTrackerPage.tsx` -> Authentication, Validation, Scheduler/Cron, Database Access, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/insights/InsightsComparePage.tsx` -> Authentication, Database Access, AI Integration, Analytics/Insights
- `app/src/sections/insights/InsightsMarketPage.tsx` -> Authentication, Scheduler/Cron, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/insights/InsightsNewsPage.tsx` -> Authentication, Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
- `app/src/sections/insights/InsightsProjectsPage.tsx` -> Authentication, Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
- `app/src/sections/insights/InsightsTabs.tsx` -> Analytics/Insights
- `app/src/sections/layout-units/FloorDetailPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration
- `app/src/sections/layout-units/LayoutAIAssist.tsx` -> File/Media Handling, AI Integration
- `app/src/sections/layout-units/LayoutUnitBuilderPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/layout-units/LayoutUnitsShell.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/layout-units/PaymentGatewayPlaceholder.tsx` -> Authentication
- `app/src/sections/layout-units/UnitsListPage.tsx` -> Authentication, Database Access, AI Integration, Analytics/Insights
- `app/src/sections/Login.tsx` -> Authentication, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/MessagesPage.tsx` -> Authentication, Validation, Realtime, Scheduler/Cron, Database Access, AI Integration, Maps/Geo, Notifications
- `app/src/sections/NotificationsPage.tsx` -> Authentication, AI Integration, Notifications, Analytics/Insights
- `app/src/sections/owner/OwnerAddPropertyPage.tsx` -> Authentication, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerAnalyticsPage.tsx` -> File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/owner/OwnerDashboardPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerEditPropertyPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerLeadsPage.tsx` -> Database Access, AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerListingsPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerPaymentsPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerProfilePage.tsx` -> Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/owner/OwnerPropertyForm.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/owner/OwnerRentalsPage.tsx` -> Queue/Async Jobs, File/Media Handling, AI Integration, Notifications, Analytics/Insights
- `app/src/sections/owner/OwnerSubscriptionPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/portal/BuildingMaterialsPage.tsx` -> Authentication, Queue/Async Jobs, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/portal/ConstructWithUsPage.tsx` -> Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/portal/EarlySupportersPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/portal/InvestPage.tsx` -> Authentication, Scheduler/Cron, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/portal/MarketplaceListingsPage.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/portal/PortalHomePage.tsx` -> Authentication, Scheduler/Cron, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/portal/PortalPropertyDetailsPage.tsx` -> Authentication, Validation, Database Access, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/portal/PostPropertyFlowPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/portal/PropertyListingCard.tsx` -> AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/PressPage.tsx` -> Authentication, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/PrivacyPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/ProfilePage.tsx` -> Authentication, Authorization/RBAC, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/PropertyDetailsPage.tsx` -> Authentication, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/PropertySearchPage.tsx` -> Authentication, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Register.tsx` -> Authentication, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/rent/RentCoLivingPage.tsx` -> AI Integration
- `app/src/sections/rent/RentDetailsPage.tsx` -> Validation, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/rent/RentMapPage.tsx` -> AI Integration, Maps/Geo
- `app/src/sections/rent/RentMarketplacePage.tsx` -> Authentication, Validation, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/rent/RentShortTermPage.tsx` -> AI Integration
- `app/src/sections/rent/SavedRentalsPage.tsx` -> File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/RentPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/SavedSearchesPage.tsx` -> AI Integration, Notifications, Analytics/Insights
- `app/src/sections/SecurityPage.tsx` -> Authentication, AI Integration, Analytics/Insights
- `app/src/sections/SellPage.tsx` -> Authentication, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Services.tsx` -> AI Integration, Maps/Geo, Analytics/Insights
- `app/src/sections/Statistics.tsx` -> Scheduler/Cron, AI Integration
- `app/src/sections/StrategicModulesPage.tsx` -> Scheduler/Cron, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `app/src/sections/TeamAdminPage.tsx` -> Authentication, Queue/Async Jobs, Scheduler/Cron, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `app/src/sections/TermsPage.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/Testimonials.tsx` -> AI Integration, Analytics/Insights
- `app/src/sections/UnsubscribePage.tsx` -> Authentication, AI Integration, Maps/Geo
- `app/src/sections/workflow/CommonBlocks.tsx` -> Authentication, Database Access, AI Integration, Analytics/Insights
- `server/src/controllers/layoutUnitsController.js` -> Authentication, Validation, Database Access, File/Media Handling, AI Integration
- `server/src/jobs/infraIngest.js` -> Rate Limiting, Queue/Async Jobs, Scheduler/Cron, Database Access, AI Integration, Maps/Geo
- `server/src/jobs/pibIngest.js` -> Database Access, AI Integration
- `server/src/middleware/auditLogger.js` -> Database Access, AI Integration
- `server/src/middleware/auth.js` -> Authentication, Authorization/RBAC, Database Access, AI Integration
- `server/src/middleware/rateLimit.js` -> Rate Limiting, AI Integration
- `server/src/routes/aiAssistant.js` -> Authentication, Validation, Rate Limiting, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `server/src/routes/apartmentComplex.js` -> Authentication, Authorization/RBAC, Validation, Scheduler/Cron, Database Access, AI Integration, Notifications
- `server/src/routes/auth.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, File/Media Handling, AI Integration, Maps/Geo, Notifications, Analytics/Insights
- `server/src/routes/builder.js` -> Authentication, Authorization/RBAC, Validation, Database Access, File/Media Handling, AI Integration, Maps/Geo
- `server/src/routes/chat.js` -> Authentication, Validation, Rate Limiting, Realtime, Database Access, AI Integration, Notifications
- `server/src/routes/eauction.js` -> Authentication, Validation, Database Access, AI Integration
- `server/src/routes/groupDeals.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, AI Integration, Maps/Geo
- `server/src/routes/infraIngest.js` -> Authentication, Authorization/RBAC, Database Access, AI Integration, Analytics/Insights
- `server/src/routes/infraSubscriptions.js` -> Authentication, Authorization/RBAC, Validation, Database Access, AI Integration, Notifications, Analytics/Insights
- `server/src/routes/infraUpdates.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `server/src/routes/insights.js` -> Authentication, Authorization/RBAC, Validation, Scheduler/Cron, Database Access, AI Integration, Maps/Geo, Analytics/Insights
- `server/src/routes/investSignals.js` -> Rate Limiting, AI Integration, Analytics/Insights
- `server/src/routes/layoutUnits.js` -> Authentication, Authorization/RBAC, File/Media Handling
- `server/src/routes/locations.js` -> Validation, Rate Limiting, AI Integration, Maps/Geo
- `server/src/routes/materials.js` -> Authentication, Authorization/RBAC, Validation, Database Access, AI Integration, Maps/Geo
- `server/src/routes/owner.js` -> Authentication, Authorization/RBAC, Validation, Queue/Async Jobs, Database Access, File/Media Handling, AI Integration, Notifications, Analytics/Insights
- `server/src/routes/promotions.js` -> Authentication, Authorization/RBAC, Validation, Database Access, AI Integration
- `server/src/routes/realty.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `server/src/routes/rentals.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, File/Media Handling, AI Integration, Analytics/Insights
- `server/src/routes/support.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Database Access, AI Integration
- `server/src/routes/workflow.js` -> Authentication, Authorization/RBAC, Validation, Rate Limiting, Queue/Async Jobs, Database Access, File/Media Handling, AI Integration, Notifications, Analytics/Insights
- `server/src/services/analytics/jobs.js` -> Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
- `server/src/services/chatRealtime.js` -> Authentication, Realtime, Database Access, AI Integration
- `server/src/services/indiaVillageDirectory.js` -> Authentication, AI Integration
- `server/src/services/insights/helpers.js` -> Authentication, Validation, File/Media Handling, AI Integration, Analytics/Insights
- `server/src/services/insights/jobs.js` -> Authentication, Scheduler/Cron, Database Access, AI Integration, Analytics/Insights
- `server/src/services/insights/queries.js` -> Authentication, Scheduler/Cron, Database Access, File/Media Handling, AI Integration, Maps/Geo, Analytics/Insights
- `server/src/services/managedAuth.js` -> Authentication, Authorization/RBAC, Database Access, AI Integration
- `server/src/services/otpDelivery.js` -> Authentication, AI Integration, Notifications
- `server/src/services/queue/index.js` -> Queue/Async Jobs, Scheduler/Cron, AI Integration, Notifications, Analytics/Insights
- `server/src/utils/fetchWithRetry.js` -> Rate Limiting, AI Integration
- `server/src/utils/fileValidation.js` -> File/Media Handling
- `server/src/utils/groupDealAuto.js` -> Database Access, AI Integration
- `server/src/utils/passwordPolicy.js` -> Authentication, AI Integration

## 13) Change Playbook (Exact File Groups + Sequence)

Hindi quick line: **Feature change karne ka practical step-by-step sequence yaha ready hai.**

- A) Add/Change any REST API endpoint
  - Step 1: Update or create route handler in `server/src/routes/<domain>.js`.
  - Step 2: Add/adjust middleware checks in `server/src/middleware/auth.js` or route-level guards.
  - Step 3: Update DB query logic in route file or related service under `server/src/services/*`.
  - Step 4: If schema changes are needed, update `server/sql/migrations/*.sql` and `server/src/db.js` ensure-group.
  - Step 5: If the route is new module, mount it in `server/src/index.js` under legacy + `/api/v1` prefixes.
  - Step 6: Update frontend API wrapper in `app/src/lib/*Api.ts` or relevant section component.
  - Step 7: Update affected UI screens in `app/src/sections/**/*` and navigation mapping in `app/src/App.tsx` if needed.
- B) Add new frontend page/view
  - Step 1: Create page component in `app/src/sections/...`.
  - Step 2: Add lazy import in `app/src/App.tsx`.
  - Step 3: Add path->view mapping in `viewFromPathname` in `app/src/App.tsx`.
  - Step 4: Add render condition block `currentView === '...'` in `app/src/App.tsx`.
  - Step 5: Add view key in `app/src/lib/views.ts`.
  - Step 6: Wire header/footer/menu navigation callbacks.
- C) Change auth/permission behavior
  - Step 1: Update token/session logic in `server/src/middleware/auth.js`.
  - Step 2: Update role/permission tables and seeds in `server/src/db.js` (+ migration if needed).
  - Step 3: Update auth route flows in `server/src/routes/auth.js`.
  - Step 4: Update frontend session handling in `app/src/lib/session.ts` and managed bridge in `app/src/lib/supabase.ts`.
  - Step 5: Verify protected view access logic in `canAccessView` (`app/src/App.tsx`).
- D) Change chat/realtime flow
  - Step 1: API changes in `server/src/routes/chat.js`.
  - Step 2: Socket event or presence changes in `server/src/services/chatRealtime.js`.
  - Step 3: DB table impact in chat tables inside `server/src/db.js`.
  - Step 4: Frontend socket consumer changes in `app/src/sections/MessagesPage.tsx`.
- E) Change infra tracker/ingestion
  - Step 1: Infra routes in `server/src/routes/infraUpdates.js`, `infraSubscriptions.js`, `infraIngest.js`.
  - Step 2: Source ingestion job changes in `server/src/jobs/infraIngest.js` and `server/src/jobs/pibIngest.js`.
  - Step 3: Scheduler toggles in `server/src/index.js` and env keys `INFRA_*`.
  - Step 4: Frontend pages in `app/src/sections/InfrastructureTrackerPage.tsx` and admin infra pages.
- F) Change AI assistant behavior/provider
  - Step 1: Prompt/model/provider logic in `server/src/routes/aiAssistant.js`.
  - Step 2: Update env examples for `OPENAI_*` / `GEMINI_*` keys if needed.
  - Step 3: Frontend callers in `app/src/lib/aiChatbotApi.ts`, `app/src/sections/MessagesPage.tsx`, widget components.
- G) Change DB schema safely
  - Step 1: Create new SQL migration in `server/sql/migrations/`.
  - Step 2: Mirror changes in correct ensure-function inside `server/src/db.js`.
  - Step 3: Update route/service query shape and frontend payload mapping.
  - Step 4: Backfill or compatibility handling for old rows/legacy columns where needed.

## 14) Interview-Ready “How It Works” Script

Hindi quick line: **Is script ko bolke aap project architecture confidently explain kar sakte ho.**

- This project is a full-stack real-estate platform with a React + TypeScript frontend and an Express + PostgreSQL backend.
- Frontend navigation is view-driven inside a central App shell (`App.tsx`) that maps URL paths to logical app views and lazy-loaded sections.
- The frontend uses a single HTTP client abstraction (`apiRequest`) for auth token attachment, device tracking, and API version prefix routing.
- Backend routes are domain-split (auth, workflow, realty, owner, rentals, insights, infra, chat, materials, support, promotions, etc.) and mounted under both legacy and `/api/v1` prefixes.
- Security is layered using Helmet, CORS allowlist, strict headers, JWT auth middleware, RBAC permissions, and route-specific rate limiters.
- PostgreSQL schema bootstrap is managed by ensure-functions in `db.js`, and historical schema evolution is tracked in SQL migrations.
- The system supports asynchronous processing with optional Redis/BullMQ queues and cron-driven schedulers for analytics, reminders, and ingestion.
- Realtime communication is implemented with Socket.IO for chat conversations, message delivery/read receipts, and online presence updates.
- External integrations include Supabase (managed auth bridge), Google Maps, OpenAI/Gemini AI assistant, SMTP/Twilio notifications, NSE feed, and OSM/Nominatim geocoding.
- For change requests, we follow a predictable file-group sequence: route/service/db/migration/backend mount/frontend API wrapper/frontend section.

## 15) Common Interview Q&A

- Q: How is routing done on frontend?
  - A: Using path-to-view resolution in `App.tsx`, then conditional rendering of lazy-loaded page sections.
- Q: How are APIs versioned?
  - A: Frontend adds `VITE_API_VERSION_PREFIX`; backend mounts the same route modules under legacy and `/api/v1` prefixes.
- Q: How is authentication handled?
  - A: JWT session auth with device/session tracking; optional managed auth via Supabase bridge.
- Q: How do you enforce authorization?
  - A: Role and permission guards through middleware (`requireRole`, `requirePermission`) plus RBAC tables.
- Q: Where is validation implemented?
  - A: Primarily at route level with Zod schemas; errors normalized in the global error handler.
- Q: How do you prevent abuse?
  - A: Route-level rate limiters with Redis-backed shared windows and in-memory fallback.
- Q: How is realtime chat implemented?
  - A: Socket.IO server in `chatRealtime.js` + REST endpoints in `chat.js` + frontend socket client in `MessagesPage.tsx`.
- Q: How are background jobs handled?
  - A: Cron schedulers and optional BullMQ queue workers with fallback to inline execution.
- Q: How is DB schema managed?
  - A: Ensure-functions bootstrap tables; SQL migrations capture timeline for controlled schema changes.
- Q: How do external AI providers work here?
  - A: AI route chooses OpenAI or Gemini based on env availability and provider responses.
- Q: How is infra data ingestion done?
  - A: Scheduled jobs fetch PIB and optional tender/PPP sources, store inbox items, and publish admin-reviewed updates.
- Q: How do you safely modify a feature?
  - A: Follow the change playbook: API/domain layer, schema if needed, frontend wrapper, and UI integration updates.

## 16) Binary Artifacts (Described, Not Inlined)

Hindi quick line: **Binary files ko embed nahi kiya gaya, sirf map kiya gaya hai.**

- .jpg: 32 files
- .png: 18 files
- .svg: 6 files
- .pptx: 2 files
- .ico: 1 files
- .zip: 1 files
- Notable binary/document assets:
  - `docs/ZDT-Realty-Founding-Round-Pitch.pptx`
  - `docs/_svg-test.pptx`
  - `docs/pitch-assets/screenshots/01-home.png`
  - `docs/pitch-assets/screenshots/02-buy-marketplace.png`
  - `docs/pitch-assets/screenshots/03-infrastructure-tracker.png`
  - `docs/pitch-assets/screenshots/04-insights-market.png`
  - `docs/pitch-assets/screenshots/05-eauction.png`
  - `docs/pitch-assets/screenshots/06-group-deals.png`
  - `docs/pitch-assets/screenshots/07-dealers-builders.png`
  - `docs/pitch-assets/screenshots/08-owner-dashboard.png`
  - `images/avatar-1.jpg`
  - `images/avatar-2.jpg`
  - `images/avatar-3.jpg`
  - `images/avatar-4.jpg`
  - `images/hero-bg.jpg`
  - `images/logo.png`
  - `images/property-1.jpg`
  - `images/property-2.jpg`
  - `images/property-3.jpg`
  - `images/property-4.jpg`
  - `images/property-5.jpg`
  - `images/service-analytics.jpg`
  - `images/service-apartments.jpg`
  - `images/service-location.jpg`
  - `images/service-materials.jpg`
  - `images/service-news.jpg`
  - `images/service-subscription.jpg`
  - `server/data/village-directory.csv.zip`

## 17) Coverage Check against Requested Plan

- [PASS] All backend route modules included -> route_files=21, mounted_modules=21
- [PASS] Mounted prefixes captured -> modules_with_mounts=21
- [PASS] Frontend route/view mappings captured -> static=65, dynamic=8, components=81
- [PASS] DB tables and migrations listed -> ensure_groups=12, migrations=22
- [PASS] Env vars documented -> app_env=10, server_env=79

## 18) Quick Regeneration

- Run: `python tools/project-doc/generate_project_handbook.py`
- Outputs: `PROJECT_MASTER_HANDBOOK.md` and `PROJECT_MASTER_HANDBOOK.docx` in repo root.
