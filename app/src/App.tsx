import { useEffect, useRef, useState } from 'react';

import AppChrome from '@/components/app/AppChrome';
import AppViewRenderer from '@/components/app/AppViewRenderer';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import {
  canAccessView,
  getDefaultPrivateView,
  getShellVisibility,
} from '@/lib/appRoutes';
import { ApiError, apiRequest } from '@/lib/http';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';
import {
  clearSession,
  parseApiUser,
  readStoredUser,
  readToken,
  saveSession,
  setSessionToken,
  type AuthUser,
} from '@/lib/session';
import {
  clearManagedLinkHint,
  getManagedAccessToken,
  getManagedSession,
  isManagedRecoveryHintPresent,
  isSupabaseConfigured,
  readManagedLinkHint,
  setManagedLinkHint,
  signOutManagedAuth,
  subscribeToManagedAuthChanges,
} from '@/lib/supabase';
import { trackGoogleAnalyticsPageView } from '@/lib/googleAnalytics';

type StrategicModuleView =
  | 'area-insights'
  | 'affordability'
  | 'buyer-journey'
  | 'alerts'
  | 'compare-plus'
  | 'builder-trust'
  | 'site-visits'
  | 'legal-assist'
  | 'investment-screener'
  | 'referrals';

function App() {
  const storedUser = readStoredUser();
  const [isLoaded, setIsLoaded] = useState(false);
  const [authToken, setAuthToken] = useState(() => {
    const token = readToken();
    return storedUser ? token || 'cookie-session' : token || '';
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(storedUser);
  const [messagePageReferenceSeed, setMessagePageReferenceSeed] = useState('');
  const [messagePageCompanySeed, setMessagePageCompanySeed] = useState<number | null>(null);
  const [messagePageConversationSeed, setMessagePageConversationSeed] = useState<number | null>(null);
  const [messagePageDraftSeed, setMessagePageDraftSeed] = useState('');
  const [layoutBuildingId, setLayoutBuildingId] = useState<number | null>(null);
  const [layoutFloorId, setLayoutFloorId] = useState<number | null>(null);
  const currentUserRef = useRef<AuthUser | null>(storedUser);
  const isMountedRef = useRef(true);

  const { currentView, routeState, navigateTo } = useAppNavigation({
    initialUser: storedUser,
    currentUser,
  });
  const navigateToRef = useRef(navigateTo);
  const currentViewRef = useRef(currentView);
  const shellVisibility = getShellVisibility(currentView, Boolean(currentUser));
  const isAuthenticated = Boolean(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const syncAuthenticatedUserFromServer = async (tokenHint = '') => {
    const normalizedToken = String(tokenHint || '').trim();
    if (normalizedToken) {
      setSessionToken(normalizedToken);
    }

    try {
      const response = await apiRequest<{ user: unknown }>('/auth/me', {}, normalizedToken || undefined);
      const user = parseApiUser(response.user);
      if (!user) {
        throw new Error('Invalid session user payload');
      }

      if (!isMountedRef.current) {
        return { token: normalizedToken || readToken(), user };
      }

      const liveToken = String(normalizedToken || readToken()).trim();
      clearManagedLinkHint();
      setAuthToken(liveToken || 'cookie-session');
      setCurrentUser(user);
      saveSession(liveToken, user);
      return { token: liveToken, user };
    } catch (error) {
      if (!isMountedRef.current) {
        throw error;
      }

      const requiresManagedLink =
        error instanceof ApiError && error.code === 'managed_auth_link_required';
      if (requiresManagedLink && isSupabaseConfigured()) {
        const existingManagedLinkHint = readManagedLinkHint();
        try {
          const managedSession = await getManagedSession();
          setManagedLinkHint({
            email: managedSession?.user?.email || existingManagedLinkHint?.email || '',
            provider: existingManagedLinkHint?.provider || error.provider,
          });
        } catch {
          setManagedLinkHint({
            email: existingManagedLinkHint?.email || '',
            provider:
              existingManagedLinkHint?.provider ||
              (error instanceof ApiError ? error.provider : null),
          });
        }
      } else {
        clearManagedLinkHint();
      }

      throw error;
    }
  };

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      trackGoogleAnalyticsPageView();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [routeState]);

  useEffect(() => {
    let active = true;
    setIsLoaded(true);

    const bootstrap = async () => {
      let managedToken = '';
      if (isSupabaseConfigured()) {
        try {
          managedToken = await getManagedAccessToken();
        } catch {
          // Ignore managed auth bootstrap failures and continue to server session check.
        }
      }

      try {
        await syncAuthenticatedUserFromServer(managedToken);
      } catch (error) {
        if (!active) {
          return;
        }

        const requiresManagedLink =
          error instanceof ApiError && error.code === 'managed_auth_link_required';
        const noAccountFound =
          error instanceof ApiError && error.code === 'managed_auth_no_account';

        // Sign out the managed session so it doesn't keep retrying
        if ((requiresManagedLink || noAccountFound) && isSupabaseConfigured()) {
          try {
            await signOutManagedAuth();
          } catch {
            // best-effort cleanup
          }
        }

        clearSession();
        setAuthToken('');
        setCurrentUser(null);
        navigateToRef.current(
          noAccountFound
            ? 'register'
            : requiresManagedLink
              ? 'login'
              : canAccessView(currentViewRef.current, null)
                ? currentViewRef.current
                : 'home',
          {
            pushHistory: false,
            smoothScroll: false,
          }
        );
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const isAuthShellView =
      currentView === 'login' ||
      currentView === 'register' ||
      currentView === 'admin-login' ||
      currentView === 'team-login' ||
      (currentView === 'forgot-password' && !isManagedRecoveryHintPresent());

    if (!isAuthShellView) {
      return;
    }

    navigateToRef.current(getDefaultPrivateView(currentUser), {
      pushHistory: true,
      smoothScroll: false,
    });
  }, [currentUser, currentView]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    return subscribeToManagedAuthChanges((event, session) => {
      const nextToken = session?.access_token || '';
      const activeUser = currentUserRef.current;

      if (event === 'PASSWORD_RECOVERY') {
        if (nextToken) {
          if (activeUser?.authStrategy === 'managed') {
            saveSession(nextToken, activeUser);
          } else {
            setSessionToken(nextToken);
          }
          setAuthToken(nextToken);
        }
        navigateToRef.current('forgot-password', { pushHistory: true, smoothScroll: true });
        return;
      }

      if (event === 'SIGNED_OUT') {
        clearManagedLinkHint();
        if (activeUser?.authStrategy === 'managed') {
          clearSession();
          setAuthToken('');
          setCurrentUser(null);
          navigateToRef.current('login', { pushHistory: true, smoothScroll: true });
        } else if (!activeUser) {
          setSessionToken('');
          setAuthToken('');
        }
        return;
      }

      if (!nextToken) {
        return;
      }

      if (activeUser?.authStrategy === 'managed') {
        saveSession(nextToken, activeUser);
        setAuthToken(nextToken);
        return;
      }

      if (!activeUser) {
        void syncAuthenticatedUserFromServer(nextToken).catch(() => {
          if (!isMountedRef.current || currentUserRef.current) {
            return;
          }

          clearSession();
          setAuthToken('');
          setCurrentUser(null);
        });
        return;
      }

      setSessionToken(nextToken);
      setAuthToken(nextToken);
    });
  }, []);

  const syncAuthenticatedSession = (
    payload: { token: string; user: AuthUser },
    options?: { navigate?: boolean }
  ) => {
    const token = String(payload.token || '').trim();
    clearManagedLinkHint();
    setCurrentUser(payload.user);
    setAuthToken(token || 'cookie-session');
    saveSession(token, payload.user);
    if (options?.navigate !== false) {
      navigateTo(getDefaultPrivateView(payload.user));
    }
  };

  const handleLoginSuccess = (payload?: { token: string; user: AuthUser }) => {
    if (payload?.user) {
      syncAuthenticatedSession(payload);
      return;
    }

    void apiRequest<{ user: unknown }>('/auth/me')
      .then((response) => {
        const user = parseApiUser(response.user);
        if (!user) {
          throw new Error('Invalid session user payload');
        }
        const liveToken = readToken();
        syncAuthenticatedSession({ token: liveToken, user });
      })
      .catch(() => {
        clearManagedLinkHint();
        clearSession();
        setAuthToken('');
        setCurrentUser(null);
        navigateTo('login');
      });
  };

  const handleCompanyPortalAuthSuccess = (payload: { token: string; user: AuthUser }) => {
    saveSession(payload.token, payload.user);
    setAuthToken(payload.token || 'cookie-session');
    setCurrentUser(payload.user);
    navigateTo('company-portal');
  };

  const handleLogout = async () => {
    try {
      if (currentUserRef.current) {
        await apiRequest('/auth/logout', { method: 'POST' });
      }
    } catch {
      // Local logout still proceeds even if API revoke fails.
    } finally {
      clearManagedLinkHint();
      if (isSupabaseConfigured()) {
        try {
          await signOutManagedAuth();
        } catch {
          // Local app logout should proceed even if provider cleanup fails.
        }
      }

      clearSession();
      setAuthToken('');
      setCurrentUser(null);
      setLayoutBuildingId(null);
      setLayoutFloorId(null);
      navigateTo('login');
    }
  };

  const openBuyMarketplace = (filters?: {
    state?: string;
    district?: string;
    city?: string;
    locality?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.state && filters.state.trim()) params.set('state', filters.state.trim());
    if (filters?.district && filters.district.trim()) params.set('district', filters.district.trim());
    if (filters?.city && filters.city.trim()) params.set('city', filters.city.trim());
    if (filters?.locality && filters.locality.trim()) params.set('locality', filters.locality.trim());
    const search = params.toString();
    navigateTo('buy', { search: search ? `?${search}` : null });
  };

  const openMessagesView = (
    propertyReference?: string,
    draftMessage?: string,
    conversationId?: number | null
  ) => {
    const reference = propertyReference?.trim() || '';
    const draft = draftMessage?.trim() || '';
    const normalizedConversationId = Number(conversationId);

    if (reference && (!Number.isInteger(normalizedConversationId) || normalizedConversationId <= 0)) {
      void trackPropertyInteraction({
        referenceId: reference,
        action: 'click',
        context: 'open_messages',
      });
    }

    if (Number.isInteger(normalizedConversationId) && normalizedConversationId > 0) {
      setMessagePageConversationSeed(normalizedConversationId);
      setMessagePageReferenceSeed('');
      setMessagePageCompanySeed(null);
    } else {
      setMessagePageConversationSeed(null);
      setMessagePageReferenceSeed(reference);
      setMessagePageCompanySeed(null);
    }

    setMessagePageDraftSeed(draft);
    navigateTo('messages');
  };

  const openCompanyMessagesView = (companyId?: number | null, draftMessage?: string) => {
    const candidateId = Number(companyId);
    const draft = draftMessage?.trim() || '';
    setMessagePageConversationSeed(null);
    setMessagePageReferenceSeed('');
    if (Number.isInteger(candidateId) && candidateId > 0) {
      setMessagePageCompanySeed(candidateId);
    } else {
      setMessagePageCompanySeed(null);
    }
    setMessagePageDraftSeed(draft);
    navigateTo('messages');
  };

  const openPropertyDetails = (propertyReference?: string) => {
    const reference = propertyReference?.trim() || '';
    const projectRefMatch = /^PROJECT-(\d+)$/i.exec(reference);
    if (projectRefMatch) {
      openProjectDetailsPage(Number(projectRefMatch[1]));
      return;
    }

    if (reference) {
      void trackPropertyInteraction({
        referenceId: reference,
        action: 'click',
        context: 'open_property_details',
      });
    }

    navigateTo('property-details', { propertyReference: reference || null });
  };

  const openDealerCompany = (companyId: number) => {
    navigateTo('dealers-builders-company', { companyId });
  };

  const openBuyDetailsPage = (propertyId: string | number) => {
    navigateTo('buy-details', { buyPropertyId: String(propertyId) });
  };

  const openRentDetailsPage = (rentalId: string | number) => {
    navigateTo('rent-details', { rentalId: String(rentalId) });
  };

  const openGroupDealDetailsPage = (dealCode: string) => {
    navigateTo('group-deal-details', { groupDealCode: dealCode });
  };

  const openOwnerEditPropertyPage = (propertyId: string | number) => {
    navigateTo('owner-edit-property', { ownerPropertyId: String(propertyId) });
  };

  const openProjectDetailsPage = (projectId: number, companyId?: number | null) => {
    navigateTo('project-details', {
      projectId,
      companyId: Number(companyId || routeState.companyId || 0) || null,
    });
  };

  const openNewProjectPage = () => {
    navigateTo('builder-project-new', {
      companyId: Number(routeState.companyId || 0) || null,
    });
  };

  const openLayoutUnitsFloorDetail = () => {
    navigateTo('layout-units-floor-detail');
  };

  const openLayoutUnitsBuilder = () => {
    navigateTo('layout-units-builder');
  };

  const openLayoutUnitsList = () => {
    navigateTo('layout-units-list');
  };

  const openBuildingMaterials = () => {
    navigateTo('building-materials');
  };

  const openConstructJourneyOnWhatsApp = () => {
    const configuredNumber = String(
      import.meta.env.VITE_WHATSAPP_NUMBER ||
        import.meta.env.VITE_CONSTRUCTION_WHATSAPP_NUMBER ||
        import.meta.env.VITE_CONSTRUCT_WHATSAPP_NUMBER ||
        ''
    ).trim();
    const phoneDigits = configuredNumber.replace(/\D/g, '');
    const prefilledMessageText = String(
      import.meta.env.VITE_CONSTRUCTION_WHATSAPP_TEXT ||
        'Hi ZDT Realty, I want to start my construction journey. Please guide me with packages and next steps.'
    ).trim();

    if (phoneDigits.length >= 10) {
      const prefilledMessage = encodeURIComponent(prefilledMessageText);
      const url = `https://wa.me/${phoneDigits}?text=${prefilledMessage}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    navigateTo('add-property');
  };

  const openConstructWithUs = () => {
    navigateTo('construct-with-us');
  };

  const openInsightsNews = () => {
    navigateTo('insights-news');
  };

  const openInsightsMarket = () => {
    navigateTo('insights-market');
  };

  const openInsightsProjects = () => {
    navigateTo('insights-projects');
  };

  const openInsightsCompare = () => {
    navigateTo('insights-compare');
  };

  const openStrategicModule = (view: StrategicModuleView) => {
    switch (view) {
      case 'area-insights':
        navigateTo('insights-market');
        return;
      case 'affordability':
        navigateTo('buy');
        return;
      case 'buyer-journey':
        navigateTo('dashboard');
        return;
      case 'alerts':
        navigateTo('notifications');
        return;
      case 'compare-plus':
        navigateTo('compare');
        return;
      case 'builder-trust':
        navigateTo('builder-trust');
        return;
      case 'site-visits':
        navigateTo('messages');
        return;
      case 'legal-assist':
        navigateTo('help-center');
        return;
      case 'investment-screener':
        navigateTo('invest');
        return;
      case 'referrals':
        navigateTo('referrals');
        return;
      default:
        navigateTo('home');
    }
  };

  const updateLayoutSelection = (next: { buildingId: number | null; floorId: number | null }) => {
    setLayoutBuildingId(next.buildingId);
    setLayoutFloorId(next.floorId);
  };

  const headerProps = {
    onLogin: () => navigateTo('login'),
    onRegister: () => navigateTo('register'),
    onHome: () => navigateTo('home'),
    onBuy: () => navigateTo('buy'),
    onRent: () => navigateTo('rent'),
    onProjects: () => navigateTo('projects'),
    onConstructWithUs: openConstructWithUs,
    onBuildingMaterials: openBuildingMaterials,
    onAiServices: () => navigateTo('ai-services'),
    onEAuction: () => navigateTo('e-auction'),
    onInsightsNews: () => navigateTo('insights-news'),
    onInfrastructure: () => navigateTo('infrastructure'),
    onGroupDeals: () => navigateTo('group-deals'),
    onPostProperty: () => navigateTo('sell-property'),
    onOwnerDashboard: () => navigateTo('owner-dashboard'),
    onDealersBuilders: () => navigateTo('dealers-builders'),
    onOpenStrategicModule: openStrategicModule,
    onMessages: () => openMessagesView(),
    onNotifications: () => navigateTo('notifications'),
    onCompare: () => navigateTo('compare'),
    onDashboard: () => navigateTo('dashboard'),
    onTeamDesk: () => navigateTo('team-desk'),
    onAdminDesk: () => navigateTo('admin-desk'),
    onFavorites: () => navigateTo('favorites'),
    onProfile: () => navigateTo('profile'),
    onPricing: () => navigateTo('pricing'),
    onLogout: handleLogout,
    isAuthenticated,
    userRole: currentUser?.role || null,
    isMainAdmin: currentUser?.isMainAdmin || false,
    userName: currentUser?.name || '',
    isWideLayout: currentView === 'home',
  };

  const footerProps = {
    isHomeScreen: currentView === 'home',
    onOpenHome: () => navigateTo('home'),
    onOpenAbout: () => navigateTo('about'),
    onOpenBlog: () => navigateTo('blog'),
    onOpenPress: () => navigateTo('press'),
    onOpenCareer: () => navigateTo('career'),
    onOpenHelpCenter: () => navigateTo('help-center'),
    onOpenContact: () => navigateTo('contact'),
    onOpenFaq: () => navigateTo('faq'),
    onOpenPrivacy: () => navigateTo('privacy'),
    onOpenTerms: () => navigateTo('terms'),
    onOpenCookies: () => navigateTo('cookies'),
    onOpenSecurity: () => navigateTo('security'),
    onOpenBuy: () => navigateTo('buy'),
    onOpenSell: () => navigateTo('sell-property'),
    onOpenRent: () => navigateTo('rent'),
    onOpenInvest: () => navigateTo('invest'),
    onOpenConstructWithUs: () => navigateTo('construct-with-us'),
    onOpenBuildingMaterials: () => navigateTo('building-materials'),
    onOpenGroupDeals: () => navigateTo('group-deals'),
    onOpenEAuction: () => navigateTo('e-auction'),
    onOpenInsights: () => navigateTo('insights-news'),
    onOpenPricing: () => navigateTo('pricing'),
    onOpenCollaborations: () => navigateTo('collaborations'),
  };

  return (
    <AppChrome
      isLoaded={isLoaded}
      shellVisibility={shellVisibility}
      headerProps={headerProps}
      footerProps={footerProps}
    >
      <AppViewRenderer
        currentView={currentView}
        routeState={routeState}
        authToken={authToken}
        currentUser={currentUser}
        isAuthenticated={isAuthenticated}
        messagePageReferenceSeed={messagePageReferenceSeed}
        messagePageCompanySeed={messagePageCompanySeed}
        messagePageConversationSeed={messagePageConversationSeed}
        messagePageDraftSeed={messagePageDraftSeed}
        layoutBuildingId={layoutBuildingId}
        layoutFloorId={layoutFloorId}
        navigateTo={navigateTo}
        openBuyMarketplace={openBuyMarketplace}
        openMessagesView={openMessagesView}
        openCompanyMessagesView={openCompanyMessagesView}
        openPropertyDetails={openPropertyDetails}
        openDealerCompany={openDealerCompany}
        openBuyDetailsPage={openBuyDetailsPage}
        openRentDetailsPage={openRentDetailsPage}
        openGroupDealDetailsPage={openGroupDealDetailsPage}
        openOwnerEditPropertyPage={openOwnerEditPropertyPage}
        openProjectDetailsPage={openProjectDetailsPage}
        openNewProjectPage={openNewProjectPage}
        openLayoutUnitsFloorDetail={openLayoutUnitsFloorDetail}
        openLayoutUnitsBuilder={openLayoutUnitsBuilder}
        openLayoutUnitsList={openLayoutUnitsList}
        openBuildingMaterials={openBuildingMaterials}
        openConstructJourneyOnWhatsApp={openConstructJourneyOnWhatsApp}
        openConstructWithUs={openConstructWithUs}
        openInsightsNews={openInsightsNews}
        openInsightsMarket={openInsightsMarket}
        openInsightsProjects={openInsightsProjects}
        openInsightsCompare={openInsightsCompare}
        handleLoginSuccess={handleLoginSuccess}
        handleCompanyPortalAuthSuccess={handleCompanyPortalAuthSuccess}
        handleLogout={handleLogout}
        syncAuthenticatedSession={syncAuthenticatedSession}
        updateLayoutSelection={updateLayoutSelection}
        onConsumeInitialPropertyReference={() => setMessagePageReferenceSeed('')}
        onConsumeInitialCompanyId={() => setMessagePageCompanySeed(null)}
        onConsumeInitialConversationId={() => setMessagePageConversationSeed(null)}
        onConsumeInitialDraftMessage={() => setMessagePageDraftSeed('')}
      />
    </AppChrome>
  );
}

export default App;
