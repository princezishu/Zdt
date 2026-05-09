import { Suspense, lazy, type ReactNode } from 'react';

import { RoutePageSkeleton } from '@/components/loading/PageSkeletons';
import type { AppRouteState, NavigationOptions } from '@/lib/appRoutes';
import type { AuthUser } from '@/lib/session';
import type { AppView } from '@/lib/views';
import { OwnerSubscriptionAccessProvider } from '@/sections/owner/OwnerSubscriptionAccessContext';

const PortalHomePage = lazy(() => import('@/sections/portal/PortalHomePage'));
const BuildingMaterialsPage = lazy(() => import('@/sections/portal/BuildingMaterialsPage'));
const ConstructWithUsPage = lazy(() => import('@/sections/portal/ConstructWithUsPage'));
const InfrastructureTrackerPage = lazy(() => import('@/sections/InfrastructureTrackerPage'));
const BuilderTrustPage = lazy(() => import('@/modules/trust/pages/BuilderTrustPage'));
const MarketplaceListingsPage = lazy(() => import('@/sections/portal/MarketplaceListingsPage'));
const PortalPropertyDetailsPage = lazy(() => import('@/sections/portal/PortalPropertyDetailsPage'));
const DeveloperPage = lazy(() => import('@/sections/DeveloperPage'));
const AIServicesPage = lazy(() => import('@/sections/AIServicesPage'));
const BuyPage = lazy(() => import('@/sections/BuyPage'));
const SellPage = lazy(() => import('@/sections/SellPage'));
const RentPage = lazy(() => import('@/sections/RentPage'));
const AddProperty = lazy(() => import('@/sections/AddProperty'));
const Login = lazy(() => import('@/sections/Login'));
const Register = lazy(() => import('@/sections/Register'));
const ForgotPassword = lazy(() => import('@/sections/ForgotPassword'));
const Dashboard = lazy(() => import('@/sections/Dashboard'));
const ProfilePage = lazy(() => import('@/sections/ProfilePage'));
const TeamAdminPage = lazy(() => import('@/sections/TeamAdminPage'));
const CareerPage = lazy(() => import('@/sections/CareerPage'));
const AdminDeskPage = lazy(() => import('@/sections/AdminDeskPage'));
const AboutPage = lazy(() => import('@/sections/AboutPage'));
const BlogPage = lazy(() => import('@/sections/BlogPage'));
const PressPage = lazy(() => import('@/sections/PressPage'));
const HelpCenterPage = lazy(() => import('@/sections/HelpCenterPage'));
const ContactPage = lazy(() => import('@/sections/ContactPage'));
const FaqPage = lazy(() => import('@/sections/FaqPage'));
const PrivacyPage = lazy(() => import('@/sections/PrivacyPage'));
const TermsPage = lazy(() => import('@/sections/TermsPage'));
const CookiesPage = lazy(() => import('@/sections/CookiesPage'));
const SecurityPage = lazy(() => import('@/sections/SecurityPage'));
const UnsubscribePage = lazy(() => import('@/sections/UnsubscribePage'));
const GroupDealsPage = lazy(() => import('@/sections/GroupDealsPage'));
const GroupDealDetailPage = lazy(() => import('@/sections/GroupDealDetailPage'));
const AdminGroupDealsPage = lazy(() => import('@/sections/AdminGroupDealsPage'));
const AdminInfraAddPage = lazy(() => import('@/sections/AdminInfraAddPage'));
const AdminInfraManagePage = lazy(() => import('@/sections/AdminInfraManagePage'));
const AdminInfraSubscribersPage = lazy(() => import('@/sections/AdminInfraSubscribersPage'));
const AdminInfraInboxPage = lazy(() => import('@/sections/AdminInfraInboxPage'));
const AdminInfraPreviewPage = lazy(() => import('@/sections/AdminInfraPreviewPage'));
const MessagesPage = lazy(() => import('@/sections/MessagesPage'));
const FavoritesPage = lazy(() => import('@/sections/FavoritesPage'));
const NotificationsPage = lazy(() => import('@/sections/NotificationsPage'));
const ComparePage = lazy(() => import('@/sections/ComparePage'));
const SavedSearchesPage = lazy(() => import('@/sections/SavedSearchesPage'));
const EAuctionPage = lazy(() => import('@/sections/eauction/EAuctionPage'));
const DealersDirectoryPage = lazy(() => import('@/sections/dealers/DealersDirectoryPage'));
const CompanyProfilePage = lazy(() => import('@/sections/dealers/CompanyProfilePage'));
const NewProjectPage = lazy(() => import('@/sections/dealers/NewProjectPage'));
const ProjectDetailsPage = lazy(() => import('@/sections/dealers/ProjectDetailsPage'));
const DealersBuildersPage = lazy(() => import('@/sections/DealersBuildersPage'));
const BuyMapPage = lazy(() => import('@/sections/buy/BuyMapPage'));
const BuyPropertyDetailsPage = lazy(() => import('@/sections/buy/BuyPropertyDetailsPage'));
const RentMapPage = lazy(() => import('@/sections/rent/RentMapPage'));
const RentDetailsPage = lazy(() => import('@/sections/rent/RentDetailsPage'));
const RentShortTermPage = lazy(() => import('@/sections/rent/RentShortTermPage'));
const RentCoLivingPage = lazy(() => import('@/sections/rent/RentCoLivingPage'));
const SavedRentalsPage = lazy(() => import('@/sections/rent/SavedRentalsPage'));
const RentMarketplacePage = lazy(() => import('@/sections/rent/RentMarketplacePage'));
const FloorDetailPage = lazy(() => import('@/sections/layout-units/FloorDetailPage'));
const LayoutUnitBuilderPage = lazy(() => import('@/sections/layout-units/LayoutUnitBuilderPage'));
const UnitsListPage = lazy(() => import('@/sections/layout-units/UnitsListPage'));
const InsightsNewsPage = lazy(() => import('@/sections/insights/InsightsNewsPage'));
const InsightsMarketPage = lazy(() => import('@/sections/insights/InsightsMarketPage'));
const InsightsProjectsPage = lazy(() => import('@/sections/insights/InsightsProjectsPage'));
const InsightsComparePage = lazy(() => import('@/sections/insights/InsightsComparePage'));
const DalalCoinHubPage = lazy(() => import('@/sections/DalalCoinHubPage'));
const EarlySupportersPage = lazy(() => import('@/sections/portal/EarlySupportersPage'));
const InvestPage = lazy(() => import('@/sections/portal/InvestPage'));
const OwnerDashboardPage = lazy(() => import('@/sections/owner/OwnerDashboardPage'));
const OwnerAddPropertyPage = lazy(() => import('@/sections/owner/OwnerAddPropertyPage'));
const OwnerEditPropertyPage = lazy(() => import('@/sections/owner/OwnerEditPropertyPage'));
const OwnerListingsPage = lazy(() => import('@/sections/owner/OwnerListingsPage'));
const OwnerRentalsPage = lazy(() => import('@/sections/owner/OwnerRentalsPage'));
const OwnerLeadsPage = lazy(() => import('@/sections/owner/OwnerLeadsPage'));
const OwnerAnalyticsPage = lazy(() => import('@/sections/owner/OwnerAnalyticsPage'));
const OwnerSubscriptionPage = lazy(() => import('@/sections/owner/OwnerSubscriptionPage'));
const OwnerPaymentsPage = lazy(() => import('@/sections/owner/OwnerPaymentsPage'));
const OwnerProfilePage = lazy(() => import('@/sections/owner/OwnerProfilePage'));
const PricingPage = lazy(() => import('@/sections/PricingPage'));
const CollaborationsPage = lazy(() => import('@/sections/CollaborationsPage'));
const EMICalculatorPage = lazy(() => import('@/sections/EMICalculatorPage'));
const NotFoundPage = lazy(() => import('@/sections/NotFoundPage'));

type NavigateTo = (view: AppView, options?: NavigationOptions) => void;

interface AppViewRendererProps {
  currentView: AppView;
  routeState: Omit<AppRouteState, 'view'>;
  authToken: string;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  messagePageReferenceSeed: string;
  messagePageCompanySeed: number | null;
  messagePageConversationSeed: number | null;
  messagePageDraftSeed: string;
  layoutBuildingId: number | null;
  layoutFloorId: number | null;
  navigateTo: NavigateTo;
  openBuyMarketplace: (filters?: {
    state?: string;
    district?: string;
    city?: string;
    locality?: string;
  }) => void;
  openMessagesView: (
    propertyReference?: string,
    draftMessage?: string,
    conversationId?: number | null
  ) => void;
  openCompanyMessagesView: (companyId?: number | null, draftMessage?: string) => void;
  openPropertyDetails: (propertyReference?: string) => void;
  openDealerCompany: (companyId: number) => void;
  openBuyDetailsPage: (propertyId: string | number) => void;
  openRentDetailsPage: (rentalId: string | number) => void;
  openGroupDealDetailsPage: (dealCode: string) => void;
  openOwnerEditPropertyPage: (propertyId: string | number) => void;
  openProjectDetailsPage: (projectId: number, companyId?: number | null) => void;
  openNewProjectPage: () => void;
  openLayoutUnitsFloorDetail: () => void;
  openLayoutUnitsBuilder: () => void;
  openLayoutUnitsList: () => void;
  openBuildingMaterials: () => void;
  openConstructJourneyOnWhatsApp: () => void;
  openConstructWithUs: () => void;
  openInsightsNews: () => void;
  openInsightsMarket: () => void;
  openInsightsProjects: () => void;
  openInsightsCompare: () => void;
  handleLoginSuccess: (payload?: { token: string; user: AuthUser }) => void;
  handleCompanyPortalAuthSuccess: (payload: { token: string; user: AuthUser }) => void;
  handleLogout: () => Promise<void>;
  syncAuthenticatedSession: (
    payload: { token: string; user: AuthUser },
    options?: { navigate?: boolean }
  ) => void;
  updateLayoutSelection: (next: { buildingId: number | null; floorId: number | null }) => void;
  onConsumeInitialPropertyReference: () => void;
  onConsumeInitialCompanyId: () => void;
  onConsumeInitialConversationId: () => void;
  onConsumeInitialDraftMessage: () => void;
}

const viewLoader = <RoutePageSkeleton />;
const animatedViewClassName =
  'animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out';

function ViewSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={viewLoader}>{children}</Suspense>;
}

function AnimatedViewFrame({
  children,
  className = animatedViewClassName,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <ViewSuspense>{children}</ViewSuspense>
    </div>
  );
}

function readAuthReferralSearch() {
  if (typeof window === 'undefined') return '';

  const params = new URLSearchParams(window.location.search);
  const referralCode =
    params.get('ref') || params.get('referral') || params.get('referralCode') || '';

  if (!referralCode.trim()) {
    return '';
  }

  return `ref=${encodeURIComponent(referralCode.trim().toUpperCase())}`;
}

export default function AppViewRenderer({
  currentView,
  routeState,
  authToken,
  currentUser,
  isAuthenticated,
  messagePageReferenceSeed,
  messagePageCompanySeed,
  messagePageConversationSeed,
  messagePageDraftSeed,
  layoutBuildingId,
  layoutFloorId,
  navigateTo,
  openBuyMarketplace,
  openMessagesView,
  openCompanyMessagesView,
  openPropertyDetails,
  openDealerCompany,
  openBuyDetailsPage,
  openRentDetailsPage,
  openGroupDealDetailsPage,
  openOwnerEditPropertyPage,
  openProjectDetailsPage,
  openNewProjectPage,
  openLayoutUnitsFloorDetail,
  openLayoutUnitsBuilder,
  openLayoutUnitsList,
  openBuildingMaterials,
  openConstructJourneyOnWhatsApp,
  openConstructWithUs,
  openInsightsNews,
  openInsightsMarket,
  openInsightsProjects,
  openInsightsCompare,
  handleLoginSuccess,
  handleCompanyPortalAuthSuccess,
  handleLogout,
  syncAuthenticatedSession,
  updateLayoutSelection,
  onConsumeInitialPropertyReference,
  onConsumeInitialCompanyId,
  onConsumeInitialConversationId,
  onConsumeInitialDraftMessage,
}: AppViewRendererProps) {
  const {
    companyId,
    projectId,
    buyPropertyId,
    rentalId,
    propertyReference,
    groupDealCode,
    ownerPropertyId,
    infraPreviewId,
  } = routeState;
  const showCompanyPortalWorkspace = currentView === 'company-portal' && isAuthenticated;
  const authReferralSearch = readAuthReferralSearch();

  const ownerWorkspaceContent =
    currentView === 'owner-dashboard' ? (
      <OwnerDashboardPage
        onOpenAddProperty={() => navigateTo('owner-add-property')}
        onOpenListings={() => navigateTo('owner-listings')}
        onOpenLeads={() => navigateTo('owner-leads')}
        onOpenAnalytics={() => navigateTo('owner-analytics')}
        onOpenSubscriptions={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-add-property' ? (
      <OwnerAddPropertyPage
        onBack={() => navigateTo('owner-dashboard')}
        onOpenListings={() => navigateTo('owner-listings')}
        onOpenRentals={() => navigateTo('owner-rentals')}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-edit-property' && ownerPropertyId ? (
      <OwnerEditPropertyPage
        propertyId={ownerPropertyId}
        onBack={() => navigateTo('owner-listings')}
      />
    ) : currentView === 'owner-listings' ? (
      <OwnerListingsPage
        onOpenAddProperty={() => navigateTo('owner-add-property')}
        onOpenEdit={(propertyIdValue) => openOwnerEditPropertyPage(propertyIdValue)}
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-rentals' ? (
      <OwnerRentalsPage
        onOpenAddProperty={() => navigateTo('owner-add-property')}
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-leads' ? (
      <OwnerLeadsPage
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenListings={() => navigateTo('owner-listings')}
        onOpenRentals={() => navigateTo('owner-rentals')}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-analytics' ? (
      <OwnerAnalyticsPage
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenPayments={() => navigateTo('owner-payments')}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : currentView === 'owner-subscription' ? (
      <OwnerSubscriptionPage
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenPayments={() => navigateTo('owner-payments')}
      />
    ) : currentView === 'owner-payments' ? (
      <OwnerPaymentsPage onOpenDashboard={() => navigateTo('owner-dashboard')} />
    ) : currentView === 'owner-profile' ? (
      <OwnerProfilePage
        onOpenDashboard={() => navigateTo('owner-dashboard')}
        onOpenSubscription={() => navigateTo('owner-subscription')}
      />
    ) : null;

  return (
    <>
      {currentView === 'home' && (
        <AnimatedViewFrame className="animate-in fade-in duration-500">
          <PortalHomePage
            isAuthenticated={isAuthenticated}
            onOpenLogin={() => navigateTo('login')}
            onOpenRegister={() => navigateTo('register', { search: authReferralSearch || null })}
            onOpenBuy={openBuyMarketplace}
            onOpenRent={() => navigateTo('rent')}
            onOpenNewLaunch={() => navigateTo('new-launch')}
            onOpenCommercial={() => navigateTo('commercial')}
            onOpenBuildingMaterials={openBuildingMaterials}
            onOpenPlotsLand={() => navigateTo('plots-land')}
            onOpenProjects={() => navigateTo('projects')}
            onOpenInvest={() => navigateTo('invest')}
            onOpenAreaInsights={openInsightsMarket}
            onOpenInfrastructure={() => navigateTo('infrastructure')}
            onOpenPostProperty={() => navigateTo('add-property')}
            onOpenConstructWithUs={openConstructWithUs}
            onOpenEarlySupporters={() => navigateTo('early-supporters')}
            onOpenEAuction={() => navigateTo('e-auction')}
            onOpenAiServices={(serviceKey) =>
              navigateTo('ai-services', {
                search: serviceKey ? `?service=${encodeURIComponent(serviceKey)}` : null,
              })
            }
            onOpenDeveloper={() => navigateTo('developer')}
            onOpenBuilderTrust={() => navigateTo('builder-trust')}
            onOpenCompare={() => navigateTo('compare')}
            onOpenInsightsNews={openInsightsNews}
            onOpenInsightsMarket={openInsightsMarket}
            onOpenInsightsProjects={openInsightsProjects}
            onOpenInsightsCompare={openInsightsCompare}
            onOpenNotifications={() => navigateTo('notifications')}
            onOpenSavedSearches={() => navigateTo('saved-searches')}
            onOpenPropertyDetails={openPropertyDetails}
            onOpenMessages={openMessagesView}
            onOpenDashboard={() => navigateTo('dashboard')}
            onOpenOwnerListings={() => navigateTo('owner-listings')}
            onOpenOwnerAnalytics={() => navigateTo('owner-analytics')}
            onOpenOwnerLeads={() => navigateTo('owner-leads')}
            onOpenFavorites={() => navigateTo('favorites')}
            onOpenDealerCompany={openDealerCompany}
            onOpenAdminDesk={() => navigateTo('admin-desk')}
            onOpenTeamDesk={() => navigateTo('team-desk')}
            onOpenLayoutUnits={openLayoutUnitsFloorDetail}
            userName={currentUser?.name}
            userRole={currentUser?.role}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'about' && (
        <ViewSuspense>
          <AboutPage />
        </ViewSuspense>
      )}

      {currentView === 'blog' && (
        <ViewSuspense>
          <BlogPage />
        </ViewSuspense>
      )}

      {currentView === 'press' && (
        <ViewSuspense>
          <PressPage />
        </ViewSuspense>
      )}

      {currentView === 'help-center' && (
        <ViewSuspense>
          <HelpCenterPage />
        </ViewSuspense>
      )}

      {currentView === 'contact' && (
        <ViewSuspense>
          <ContactPage />
        </ViewSuspense>
      )}

      {currentView === 'faq' && (
        <ViewSuspense>
          <FaqPage />
        </ViewSuspense>
      )}

      {currentView === 'privacy' && (
        <ViewSuspense>
          <PrivacyPage />
        </ViewSuspense>
      )}

      {currentView === 'terms' && (
        <ViewSuspense>
          <TermsPage />
        </ViewSuspense>
      )}

      {currentView === 'cookies' && (
        <ViewSuspense>
          <CookiesPage />
        </ViewSuspense>
      )}

      {currentView === 'security' && (
        <ViewSuspense>
          <SecurityPage />
        </ViewSuspense>
      )}

      {currentView === 'unsubscribe' && (
        <ViewSuspense>
          <UnsubscribePage />
        </ViewSuspense>
      )}

      {currentView === 'early-supporters' && (
        <ViewSuspense>
          <EarlySupportersPage />
        </ViewSuspense>
      )}

      {(currentView === 'wallet' || currentView === 'referrals' || currentView === 'checkout') && (
        <ViewSuspense>
          <DalalCoinHubPage
            mode={currentView === 'wallet' ? 'wallet' : currentView === 'checkout' ? 'checkout' : 'referrals'}
            user={currentUser}
            onOpenWallet={() => navigateTo('wallet')}
            onOpenReferrals={() => navigateTo('referrals')}
            onOpenCheckout={() => navigateTo('checkout')}
            onOpenOwnerSubscription={() => navigateTo('owner-subscription')}
            onOpenBuildingMaterials={() => navigateTo('building-materials')}
          />
        </ViewSuspense>
      )}

      {currentView === 'invest' && (
        <ViewSuspense>
          <InvestPage
            onOpenProjects={() => navigateTo('projects')}
            onOpenProjectDetails={(projectIdValue) => openProjectDetailsPage(projectIdValue)}
            onOpenVoluntarySupport={() => navigateTo('early-supporters')}
            onOpenMessages={openMessagesView}
            onOpenCompanyMessages={openCompanyMessagesView}
            isAuthenticated={isAuthenticated}
            userName={currentUser?.name}
            userRole={currentUser?.role}
            isMainAdmin={currentUser?.isMainAdmin || false}
          />
        </ViewSuspense>
      )}

      {currentView === 'buy' && (
        <ViewSuspense>
          <BuyPage
            onViewDetails={(referenceId) => {
              if (!referenceId) return;
              openBuyDetailsPage(referenceId);
            }}
            onOpenFavorites={() => navigateTo('favorites')}
            onOpenMessages={(referenceId) => openMessagesView(referenceId)}
            onOpenCompare={() => navigateTo('compare')}
            onOpenSavedSearches={() => navigateTo('saved-searches')}
          />
        </ViewSuspense>
      )}

      {currentView === 'buy-map' && (
        <ViewSuspense>
          <BuyMapPage
            onOpenDetails={(propertyIdValue) => openBuyDetailsPage(propertyIdValue)}
            onOpenCompare={() => navigateTo('compare')}
            onOpenSaved={() => navigateTo('favorites')}
            onOpenList={() => navigateTo('buy')}
          />
        </ViewSuspense>
      )}

      {currentView === 'buy-details' && buyPropertyId ? (
        <ViewSuspense>
          <BuyPropertyDetailsPage
            propertyId={buyPropertyId}
            onBackToBuy={() => navigateTo('buy')}
            onOpenSimilar={(propertyIdValue) => openBuyDetailsPage(propertyIdValue)}
            onOpenCompare={() => navigateTo('compare')}
            onOpenSaved={() => navigateTo('favorites')}
            onOpenMessages={openMessagesView}
            onOpenGroupDeal={openGroupDealDetailsPage}
          />
        </ViewSuspense>
      ) : null}

      {currentView === 'building-materials' && (
        <ViewSuspense>
          <BuildingMaterialsPage token={authToken} user={currentUser} />
        </ViewSuspense>
      )}

      {currentView === 'infrastructure' && (
        <ViewSuspense>
          <InfrastructureTrackerPage
            onOpenListProject={() => navigateTo('sell-property')}
            onOpenPartnershipCall={() => navigateTo('contact')}
          />
        </ViewSuspense>
      )}

      {currentView === 'builder-trust' && (
        <ViewSuspense>
          <BuilderTrustPage />
        </ViewSuspense>
      )}

      {currentView === 'construct-with-us' && (
        <ViewSuspense>
          <ConstructWithUsPage
            onStartJourney={openConstructJourneyOnWhatsApp}
            onOpenProjects={() => navigateTo('projects')}
            onOpenProjectDetails={(projectIdValue) => openProjectDetailsPage(projectIdValue)}
          />
        </ViewSuspense>
      )}

      {currentView === 'rent' && (
        <ViewSuspense>
          <RentMarketplacePage
            onOpenDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
            onOpenSaved={() => navigateTo('saved-rentals')}
            onOpenMessages={openMessagesView}
            onOpenListProperty={() => navigateTo('rent-property')}
            onOpenDashboard={() => navigateTo('dashboard')}
            onOpenOwnerDashboard={() => navigateTo('owner-dashboard')}
            onOpenCompare={() => navigateTo('compare')}
            onOpenSavedSearches={() => navigateTo('saved-searches')}
          />
        </ViewSuspense>
      )}

      {(currentView === 'new-launch' ||
        currentView === 'commercial' ||
        currentView === 'plots-land' ||
        currentView === 'projects') && (
        <ViewSuspense>
          <MarketplaceListingsPage
            category={currentView}
            onOpenDetails={openPropertyDetails}
            onOpenMessages={openMessagesView}
            onOpenPostProperty={() => navigateTo('add-property')}
          />
        </ViewSuspense>
      )}

      {currentView === 'rent-map' && (
        <ViewSuspense>
          <RentMapPage
            onOpenDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
            onOpenSaved={() => navigateTo('saved-rentals')}
            onOpenList={() => navigateTo('rent')}
          />
        </ViewSuspense>
      )}

      {currentView === 'rent-details' && rentalId ? (
        <ViewSuspense>
          <RentDetailsPage
            rentalId={rentalId}
            onBackToRent={() => navigateTo('rent')}
            onOpenSimilar={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
            onOpenSaved={() => navigateTo('saved-rentals')}
            onOpenCompare={() => navigateTo('compare')}
            onOpenMessages={openMessagesView}
          />
        </ViewSuspense>
      ) : null}

      {currentView === 'rent-short-term' && (
        <ViewSuspense>
          <RentShortTermPage
            onOpenDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
            onOpenSaved={() => navigateTo('saved-rentals')}
            onOpenMap={() => navigateTo('rent-map')}
            onOpenList={() => navigateTo('rent')}
          />
        </ViewSuspense>
      )}

      {currentView === 'rent-co-living' && (
        <ViewSuspense>
          <RentCoLivingPage
            onOpenDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
            onOpenSaved={() => navigateTo('saved-rentals')}
            onOpenMap={() => navigateTo('rent-map')}
            onOpenList={() => navigateTo('rent')}
          />
        </ViewSuspense>
      )}

      {currentView === 'saved-rentals' && (
        <ViewSuspense>
          <SavedRentalsPage
            onOpenRent={() => navigateTo('rent')}
            onViewDetails={(rentalIdValue) => openRentDetailsPage(rentalIdValue)}
          />
        </ViewSuspense>
      )}

      {currentView === 'add-property' && (
        <ViewSuspense>
          <AddProperty
            onOpenSell={() => navigateTo('sell-property')}
            onOpenRent={() => navigateTo('rent-property')}
          />
        </ViewSuspense>
      )}

      {currentView === 'sell-property' && (
        <ViewSuspense>
          <SellPage
            onManageListings={() => navigateTo('owner-listings')}
            onOpenDashboard={() => navigateTo('owner-dashboard')}
            onOpenLeads={() => navigateTo('owner-leads')}
            onOpenAnalytics={() => navigateTo('owner-analytics')}
            onOpenBuilderPlans={() => {
              window.alert('Builder Plans is in beta testing and free for now.');
              navigateTo('dealers-builders');
            }}
            onOpenBuilderPortal={() => navigateTo('company-portal')}
          />
        </ViewSuspense>
      )}

      {currentView === 'rent-property' && (
        <ViewSuspense>
          <RentPage />
        </ViewSuspense>
      )}

      {currentView === 'property-details' && (
        <ViewSuspense>
          <PortalPropertyDetailsPage
            referenceId={propertyReference || undefined}
            onOpenSimilar={openPropertyDetails}
            onOpenMessages={openMessagesView}
            onOpenPostProperty={() => navigateTo('add-property')}
          />
        </ViewSuspense>
      )}

      {currentView === 'group-deals' && (
        <ViewSuspense>
          <GroupDealsPage onOpenDeal={openGroupDealDetailsPage} />
        </ViewSuspense>
      )}

      {currentView === 'group-deal-details' && groupDealCode ? (
        <ViewSuspense>
          <GroupDealDetailPage
            dealCode={groupDealCode}
            onBackToList={() => navigateTo('group-deals')}
          />
        </ViewSuspense>
      ) : null}

      {currentView === 'dealers-builders' && (
        <ViewSuspense>
          <DealersDirectoryPage onOpenCompany={openDealerCompany} />
        </ViewSuspense>
      )}

      {(currentView === 'company-login' || currentView === 'company-portal') && (
        <ViewSuspense>
          <DealersBuildersPage
            token={authToken}
            user={currentUser}
            onAuthSuccess={handleCompanyPortalAuthSuccess}
            onLogout={handleLogout}
            initialAuthMode="login"
            workspaceMode={showCompanyPortalWorkspace}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
          />
        </ViewSuspense>
      )}

      {currentView === 'company-register' && (
        <ViewSuspense>
          <DealersBuildersPage
            token={authToken}
            user={currentUser}
            onAuthSuccess={handleCompanyPortalAuthSuccess}
            onLogout={handleLogout}
            initialAuthMode="register"
            workspaceMode={false}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
          />
        </ViewSuspense>
      )}

      {currentView === 'dealers-builders-company' && companyId ? (
        <ViewSuspense>
          <CompanyProfilePage
            companyId={companyId}
            token={authToken}
            user={currentUser}
            onBackDirectory={() => navigateTo('dealers-builders')}
            onOpenProject={(projectIdValue) => openProjectDetailsPage(projectIdValue, companyId)}
            onOpenMessages={openCompanyMessagesView}
            onOpenNewProject={openNewProjectPage}
          />
        </ViewSuspense>
      ) : null}

      {currentView === 'builder-project-new' && (
        <ViewSuspense>
          <NewProjectPage
            token={authToken}
            user={currentUser}
            onBack={() => {
              if (companyId) {
                navigateTo('dealers-builders-company', { companyId });
                return;
              }
              navigateTo('dealers-builders');
            }}
            onProjectCreated={(projectIdValue) => openProjectDetailsPage(projectIdValue, companyId)}
          />
        </ViewSuspense>
      )}

      {currentView === 'project-details' && projectId ? (
        <ViewSuspense>
          <ProjectDetailsPage
            projectId={projectId}
            token={authToken}
            user={currentUser}
            onBack={() => {
              if (companyId) {
                navigateTo('dealers-builders-company', { companyId });
                return;
              }
              navigateTo('dealers-builders');
            }}
            onOpenCompany={(nextCompanyId) => openDealerCompany(nextCompanyId)}
          />
        </ViewSuspense>
      ) : null}

      {currentView === 'career' && (
        <ViewSuspense>
          <CareerPage />
        </ViewSuspense>
      )}

      {currentView === 'admin-register' && (
        <ViewSuspense>
          <CareerPage lockedPosition="Admin" />
        </ViewSuspense>
      )}

      {currentView === 'team-register' && (
        <ViewSuspense>
          <CareerPage lockedPosition="Team Member" />
        </ViewSuspense>
      )}

      {currentView === 'login' && (
        <AnimatedViewFrame>
          <Login
            onBack={() => navigateTo('home')}
            onSwitchToRegister={() => navigateTo('register', { search: authReferralSearch || null })}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
            onForgotPassword={() => navigateTo('forgot-password', { search: authReferralSearch || null })}
            onLoginSuccess={handleLoginSuccess}
            mode="user"
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-login' && (
        <AnimatedViewFrame>
          <Login
            onBack={() => navigateTo('home')}
            onSwitchToRegister={() => navigateTo('register', { search: authReferralSearch || null })}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
            onForgotPassword={() => navigateTo('forgot-password', { search: authReferralSearch || null })}
            onLoginSuccess={handleLoginSuccess}
            mode="admin"
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'team-login' && (
        <AnimatedViewFrame>
          <Login
            onBack={() => navigateTo('home')}
            onSwitchToRegister={() => navigateTo('register', { search: authReferralSearch || null })}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
            onForgotPassword={() => navigateTo('forgot-password', { search: authReferralSearch || null })}
            onLoginSuccess={handleLoginSuccess}
            mode="team"
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'register' && (
        <AnimatedViewFrame>
          <Register
            onSwitchToLogin={() => navigateTo('login', { search: authReferralSearch || null })}
            onOpenCompanyLogin={() => navigateTo('company-login')}
            onOpenCompanyRegister={() => navigateTo('company-register')}
            onRegisterSuccess={handleLoginSuccess}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'forgot-password' && (
        <AnimatedViewFrame>
          <ForgotPassword onBackToLogin={() => navigateTo('login')} />
        </AnimatedViewFrame>
      )}

      {currentView === 'dashboard' && (
        <AnimatedViewFrame>
          <Dashboard
            onBackHome={() => navigateTo('home')}
            onOpenMessages={() => navigateTo('messages')}
            onOpenFavorites={() => navigateTo('favorites')}
            onOpenOwnerPanel={() => navigateTo('owner-dashboard')}
            onOpenPostProperty={() => navigateTo('add-property')}
            onOpenCompare={() => navigateTo('compare')}
            onOpenSavedSearches={() => navigateTo('saved-searches')}
            onOpenProfile={() => navigateTo('profile')}
            onOpenNotifications={() => navigateTo('notifications')}
            onOpenWallet={() => navigateTo('wallet')}
            onOpenReferrals={() => navigateTo('referrals')}
            user={currentUser}
          />
        </AnimatedViewFrame>
      )}

      {ownerWorkspaceContent && (
        <AnimatedViewFrame>
          <OwnerSubscriptionAccessProvider>{ownerWorkspaceContent}</OwnerSubscriptionAccessProvider>
        </AnimatedViewFrame>
      )}

      {currentView === 'profile' && (
        <AnimatedViewFrame>
          <ProfilePage
            token={authToken}
            user={currentUser}
            onBackHome={() => navigateTo('home')}
            onLogout={handleLogout}
            onOpenWallet={() => navigateTo('wallet')}
            onOpenReferrals={() => navigateTo('referrals')}
            onSessionUpdated={(payload) => syncAuthenticatedSession(payload, { navigate: false })}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'messages' && (
        <AnimatedViewFrame>
          <MessagesPage
            token={authToken}
            user={currentUser}
            initialPropertyReference={messagePageReferenceSeed}
            initialCompanyId={messagePageCompanySeed}
            initialConversationId={messagePageConversationSeed}
            initialDraftMessage={messagePageDraftSeed}
            onConsumeInitialPropertyReference={onConsumeInitialPropertyReference}
            onConsumeInitialCompanyId={onConsumeInitialCompanyId}
            onConsumeInitialConversationId={onConsumeInitialConversationId}
            onConsumeInitialDraftMessage={onConsumeInitialDraftMessage}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'favorites' && (
        <AnimatedViewFrame>
          <FavoritesPage
            onOpenBuy={() => navigateTo('buy')}
            onViewDetails={(referenceId) => openPropertyDetails(referenceId)}
            onOpenMessages={(referenceId) => openMessagesView(referenceId)}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'saved' && (
        <AnimatedViewFrame>
          <FavoritesPage
            onOpenBuy={() => navigateTo('buy')}
            onViewDetails={(referenceId) => openPropertyDetails(referenceId)}
            onOpenMessages={(referenceId) => openMessagesView(referenceId)}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'compare' && (
        <AnimatedViewFrame>
          <ComparePage onOpenDetails={openPropertyDetails} onOpenMessages={openMessagesView} />
        </AnimatedViewFrame>
      )}

      {currentView === 'insights-news' && (
        <AnimatedViewFrame>
          <InsightsNewsPage token={authToken} user={currentUser} />
        </AnimatedViewFrame>
      )}

      {currentView === 'insights-market' && (
        <AnimatedViewFrame>
          <InsightsMarketPage token={authToken} user={currentUser} />
        </AnimatedViewFrame>
      )}

      {currentView === 'insights-projects' && (
        <AnimatedViewFrame>
          <InsightsProjectsPage token={authToken} user={currentUser} />
        </AnimatedViewFrame>
      )}

      {currentView === 'insights-compare' && (
        <AnimatedViewFrame>
          <InsightsComparePage token={authToken} user={currentUser} />
        </AnimatedViewFrame>
      )}

      {currentView === 'e-auction' && (
        <AnimatedViewFrame>
          <EAuctionPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'notifications' && (
        <AnimatedViewFrame>
          <NotificationsPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'saved-searches' && (
        <AnimatedViewFrame>
          <SavedSearchesPage onNavigate={navigateTo} />
        </AnimatedViewFrame>
      )}

      {currentView === 'developer' && (
        <AnimatedViewFrame>
          <DeveloperPage
            token={authToken}
            user={currentUser}
            onNavigate={navigateTo}
            onLogout={handleLogout}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-group-deals' && (
        <AnimatedViewFrame>
          <AdminGroupDealsPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-infra-add' && (
        <AnimatedViewFrame>
          <AdminInfraAddPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-infra-manage' && (
        <AnimatedViewFrame>
          <AdminInfraManagePage />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-infra-subscribers' && (
        <AnimatedViewFrame>
          <AdminInfraSubscribersPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-infra-inbox' && (
        <AnimatedViewFrame>
          <AdminInfraInboxPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-infra-preview' && infraPreviewId ? (
        <AnimatedViewFrame>
          <AdminInfraPreviewPage updateId={infraPreviewId} />
        </AnimatedViewFrame>
      ) : null}

      {currentView === 'team-desk' && (
        <AnimatedViewFrame>
          <TeamAdminPage token={authToken} user={currentUser} />
        </AnimatedViewFrame>
      )}

      {currentView === 'admin-desk' && (
        <AnimatedViewFrame>
          <AdminDeskPage
            token={authToken}
            user={currentUser}
            onOpenLayoutUnits={openLayoutUnitsFloorDetail}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'layout-units-floor-detail' && (
        <AnimatedViewFrame>
          <FloorDetailPage
            token={authToken}
            user={currentUser}
            selectedBuildingId={layoutBuildingId}
            selectedFloorId={layoutFloorId}
            onSelectionChange={updateLayoutSelection}
            onOpenFloorDetail={openLayoutUnitsFloorDetail}
            onOpenBuilder={openLayoutUnitsBuilder}
            onOpenUnitsList={openLayoutUnitsList}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'layout-units-builder' && (
        <AnimatedViewFrame>
          <LayoutUnitBuilderPage
            token={authToken}
            user={currentUser}
            selectedBuildingId={layoutBuildingId}
            selectedFloorId={layoutFloorId}
            onSelectionChange={updateLayoutSelection}
            onOpenFloorDetail={openLayoutUnitsFloorDetail}
            onOpenBuilder={openLayoutUnitsBuilder}
            onOpenUnitsList={openLayoutUnitsList}
          />
        </AnimatedViewFrame>
      )}

      {currentView === 'layout-units-list' && (
        <AnimatedViewFrame>
          <UnitsListPage
            token={authToken}
            user={currentUser}
            selectedBuildingId={layoutBuildingId}
            selectedFloorId={layoutFloorId}
            onSelectionChange={updateLayoutSelection}
            onOpenFloorDetail={openLayoutUnitsFloorDetail}
            onOpenBuilder={openLayoutUnitsBuilder}
            onOpenUnitsList={openLayoutUnitsList}
          />
        </AnimatedViewFrame>
      )}
      {currentView === 'pricing' && (
        <AnimatedViewFrame>
          <PricingPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'ai-services' && (
        <AnimatedViewFrame>
          <AIServicesPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'collaborations' && (
        <AnimatedViewFrame>
          <CollaborationsPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'emi-calculator' && (
        <AnimatedViewFrame>
          <EMICalculatorPage />
        </AnimatedViewFrame>
      )}

      {currentView === 'not-found' && (
        <AnimatedViewFrame>
          <NotFoundPage
            onOpenHome={() => navigateTo('home')}
            onOpenBuy={() => navigateTo('buy')}
            onOpenRent={() => navigateTo('rent')}
            onOpenHelpCenter={() => navigateTo('help-center')}
          />
        </AnimatedViewFrame>
      )}
    </>
  );
}
