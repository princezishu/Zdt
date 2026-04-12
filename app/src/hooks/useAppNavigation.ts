import { useEffect, useRef, useState } from 'react';

import {
  EMPTY_ROUTE_STATE,
  buildHrefForView,
  canAccessView,
  getDefaultPrivateView,
  parsePathToRoute,
  type AppHistoryState,
  type AppRouteState,
  type NavigationOptions,
} from '@/lib/appRoutes';
import type { AuthUser } from '@/lib/session';
import type { AppView } from '@/lib/views';

interface UseAppNavigationOptions {
  initialUser: AuthUser | null;
  currentUser: AuthUser | null;
}

interface ActiveRouteState extends Omit<AppRouteState, 'view'> {
  view: AppView;
}

function createEmptyRoute(view: AppView): ActiveRouteState {
  return {
    view,
    ...EMPTY_ROUTE_STATE,
  };
}

function createHistoryState(routeState: ActiveRouteState): AppHistoryState {
  const { view, ...params } = routeState;
  return {
    __zdtSpa: true,
    view,
    ...params,
  };
}

function resolveInitialView(routeState: AppRouteState, initialUser: AuthUser | null): AppView {
  if (routeState.view) {
    if (canAccessView(routeState.view, initialUser)) {
      if (routeState.view === 'builder-project-new') {
        return initialUser ? routeState.view : 'login';
      }
      return routeState.view;
    }
    if (initialUser) {
      return getDefaultPrivateView(initialUser);
    }
  }
  return 'home';
}

function createRouteStateForView(
  view: AppView,
  source?: Partial<Omit<AppRouteState, 'view'>>
): ActiveRouteState {
  const routeState = createEmptyRoute(view);

  if (view === 'dealers-builders-company') {
    routeState.companyId = Number(source?.companyId || 0) || null;
  } else if (view === 'project-details' || view === 'builder-project-new') {
    routeState.companyId = Number(source?.companyId || 0) || null;
  }

  if (view === 'project-details') {
    routeState.projectId = Number(source?.projectId || 0) || null;
  }

  if (view === 'buy-details') {
    routeState.buyPropertyId = String(source?.buyPropertyId || '').trim() || null;
  }

  if (view === 'rent-details') {
    routeState.rentalId = String(source?.rentalId || '').trim() || null;
  }

  if (view === 'property-details') {
    routeState.propertyReference = String(source?.propertyReference || '').trim() || null;
  }

  if (view === 'group-deal-details') {
    routeState.groupDealCode = String(source?.groupDealCode || '').trim() || null;
  }

  if (view === 'owner-edit-property') {
    routeState.ownerPropertyId = String(source?.ownerPropertyId || '').trim() || null;
  }

  if (view === 'admin-infra-preview') {
    routeState.infraPreviewId = String(source?.infraPreviewId || '').trim() || null;
  }

  return routeState;
}

export function useAppNavigation({ initialUser, currentUser }: UseAppNavigationOptions) {
  const [initialRoute] = useState<AppRouteState>(() => parsePathToRoute(window.location.pathname));
  const [initialView] = useState<AppView>(() => resolveInitialView(initialRoute, initialUser));
  const [routeState, setRouteState] = useState<ActiveRouteState>(() =>
    createRouteStateForView(initialView, initialRoute)
  );
  const routeStateRef = useRef(routeState);
  const currentUserRef = useRef(currentUser);
  const navigateToRef = useRef<(view: AppView, options?: NavigationOptions) => void>(() => {});

  useEffect(() => {
    routeStateRef.current = routeState;
  }, [routeState]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const navigateTo = (view: AppView, options?: NavigationOptions) => {
    const pushHistory = options?.pushHistory ?? true;
    const smoothScroll = options?.smoothScroll ?? true;
    const activeUser = currentUserRef.current;

    if (!canAccessView(view, activeUser)) {
      const fallbackView = activeUser ? getDefaultPrivateView(activeUser) : 'login';
      const fallbackRouteState = createEmptyRoute(fallbackView);

      if (smoothScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      routeStateRef.current = fallbackRouteState;
      setRouteState(fallbackRouteState);

      if (pushHistory) {
        window.history.pushState(
          createHistoryState(fallbackRouteState),
          '',
          buildHrefForView(fallbackView)
        );
      }
      return;
    }

    const currentRouteState = routeStateRef.current;
    const requestedCompanyId = Number(options?.companyId || 0);
    const requestedProjectId = Number(options?.projectId || 0);
    const requestedBuyPropertyId = String(options?.buyPropertyId || '').trim();
    const requestedRentalId = String(options?.rentalId || '').trim();
    const requestedPropertyReference = String(options?.propertyReference || '').trim();
    const requestedGroupDealCode = String(options?.groupDealCode || '').trim();
    const requestedOwnerPropertyId = String(options?.ownerPropertyId || '').trim();
    const requestedInfraPreviewId = String(options?.infraPreviewId || '').trim();

    const nextCompanyId =
      view === 'dealers-builders-company'
        ? requestedCompanyId || null
        : view === 'project-details' || view === 'builder-project-new'
          ? requestedCompanyId || currentRouteState.companyId || null
          : null;
    const nextProjectId = view === 'project-details' ? requestedProjectId || null : null;
    const nextBuyPropertyId =
      view === 'buy-details'
        ? requestedBuyPropertyId || currentRouteState.buyPropertyId || null
        : null;
    const nextRentalId =
      view === 'rent-details'
        ? requestedRentalId || currentRouteState.rentalId || null
        : null;
    const nextPropertyReference =
      view === 'property-details'
        ? requestedPropertyReference || currentRouteState.propertyReference || null
        : null;
    const nextGroupDealCode =
      view === 'group-deal-details'
        ? requestedGroupDealCode || currentRouteState.groupDealCode || null
        : null;
    const nextOwnerPropertyId =
      view === 'owner-edit-property'
        ? requestedOwnerPropertyId || currentRouteState.ownerPropertyId || null
        : null;
    const nextInfraPreviewId =
      view === 'admin-infra-preview'
        ? requestedInfraPreviewId || currentRouteState.infraPreviewId || null
        : null;

    if (view === 'dealers-builders-company' && !nextCompanyId) {
      navigateTo('dealers-builders', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'project-details' && !nextProjectId) {
      navigateTo('projects', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'buy-details' && !nextBuyPropertyId) {
      navigateTo('buy', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'rent-details' && !nextRentalId) {
      navigateTo('rent', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'group-deal-details' && !nextGroupDealCode) {
      navigateTo('group-deals', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'owner-edit-property' && !nextOwnerPropertyId) {
      navigateTo('owner-listings', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'admin-infra-preview' && !nextInfraPreviewId) {
      navigateTo('admin-infra-inbox', { pushHistory, smoothScroll });
      return;
    }

    const nextRouteState: ActiveRouteState = {
      view,
      companyId: nextCompanyId,
      projectId: nextProjectId,
      buyPropertyId: nextBuyPropertyId,
      rentalId: nextRentalId,
      propertyReference: nextPropertyReference,
      groupDealCode: nextGroupDealCode,
      ownerPropertyId: nextOwnerPropertyId,
      infraPreviewId: nextInfraPreviewId,
    };

    if (smoothScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    routeStateRef.current = nextRouteState;
    setRouteState(nextRouteState);

    if (pushHistory) {
      window.history.pushState(
        createHistoryState(nextRouteState),
        '',
        buildHrefForView(view, {
          companyId: nextCompanyId,
          projectId: nextProjectId,
          buyPropertyId: nextBuyPropertyId,
          buyPropertySlug: options?.buyPropertySlug,
          rentalId: nextRentalId,
          rentalSlug: options?.rentalSlug,
          propertyReference: nextPropertyReference,
          groupDealCode: nextGroupDealCode,
          ownerPropertyId: nextOwnerPropertyId,
          infraPreviewId: nextInfraPreviewId,
          search: options?.search,
        })
      );
    }
  };

  useEffect(() => {
    navigateToRef.current = navigateTo;
  });

  useEffect(() => {
    const initialRouteState = createRouteStateForView(initialView, initialRoute);
    const state = window.history.state as { __zdtSpa?: boolean } | null;

    if (!state?.__zdtSpa) {
      window.history.replaceState(
        createHistoryState(initialRouteState),
        '',
        buildHrefForView(initialRouteState.view, initialRouteState)
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextState = event.state as Partial<AppHistoryState> | null;

      if (nextState?.__zdtSpa && nextState.view) {
        navigateToRef.current(nextState.view, {
          pushHistory: false,
          smoothScroll: true,
          companyId: Number(nextState.companyId || 0) || null,
          projectId: Number(nextState.projectId || 0) || null,
          buyPropertyId: String(nextState.buyPropertyId || '').trim() || null,
          rentalId: String(nextState.rentalId || '').trim() || null,
          propertyReference: String(nextState.propertyReference || '').trim() || null,
          groupDealCode: String(nextState.groupDealCode || '').trim() || null,
          ownerPropertyId: String(nextState.ownerPropertyId || '').trim() || null,
          infraPreviewId: String(nextState.infraPreviewId || '').trim() || null,
        });
        return;
      }

      if (routeStateRef.current.view !== 'home') {
        navigateToRef.current('home', { pushHistory: false, smoothScroll: true });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [initialRoute, initialView]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    routeState.view,
    routeState.companyId,
    routeState.projectId,
    routeState.buyPropertyId,
    routeState.rentalId,
    routeState.propertyReference,
    routeState.groupDealCode,
    routeState.ownerPropertyId,
    routeState.infraPreviewId,
  ]);

  return {
    currentView: routeState.view,
    routeState,
    navigateTo,
  };
}
