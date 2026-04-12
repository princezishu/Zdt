import { describe, expect, it } from 'vitest';

import {
  buildHrefForView,
  canAccessView,
  getDefaultPrivateView,
  getShellVisibility,
  parsePathToRoute,
} from './appRoutes';
import type { AuthUser } from './session';

const adminUser: AuthUser = {
  id: 1,
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  isMainAdmin: true,
  authStrategy: 'legacy',
};

const teamUser: AuthUser = {
  id: 2,
  name: 'Team Member',
  email: 'team@example.com',
  role: 'team_member',
  isMainAdmin: false,
  authStrategy: 'legacy',
};

const basicUser: AuthUser = {
  id: 3,
  name: 'User',
  email: 'user@example.com',
  role: 'user',
  isMainAdmin: false,
  authStrategy: 'legacy',
};

describe('parsePathToRoute', () => {
  it('parses canonical buy detail routes', () => {
    expect(parsePathToRoute('/buy/lake-view-101')).toMatchObject({
      view: 'buy-details',
      buyPropertyId: '101',
    });
  });

  it('parses legacy buy detail routes', () => {
    expect(parsePathToRoute('/buy-details/101')).toMatchObject({
      view: 'buy-details',
      buyPropertyId: '101',
    });
  });

  it('parses canonical rent detail routes', () => {
    expect(parsePathToRoute('/rent/river-house-302')).toMatchObject({
      view: 'rent-details',
      rentalId: '302',
    });
  });

  it('preserves company portal aliases', () => {
    expect(parsePathToRoute('/company-portal').view).toBe('company-portal');
    expect(parsePathToRoute('/dealers-builders/portal').view).toBe('company-portal');
  });

  it('preserves infrastructure aliases', () => {
    expect(parsePathToRoute('/infrastructure').view).toBe('infrastructure');
    expect(parsePathToRoute('/infrastructure-tracker').view).toBe('infrastructure');
  });

  it('parses Dalal Coin private routes', () => {
    expect(parsePathToRoute('/wallet').view).toBe('wallet');
    expect(parsePathToRoute('/referrals').view).toBe('referrals');
    expect(parsePathToRoute('/checkout').view).toBe('checkout');
  });

  it('falls back for legacy routes without ids', () => {
    expect(parsePathToRoute('/buy-details').view).toBe('buy');
    expect(parsePathToRoute('/rent-details').view).toBe('rent');
    expect(parsePathToRoute('/admin/infra/preview').view).toBe('admin-infra-inbox');
  });

  it('returns null view for unknown routes', () => {
    expect(parsePathToRoute('/definitely-not-a-real-route')).toMatchObject({
      view: null,
      companyId: null,
      projectId: null,
      buyPropertyId: null,
      rentalId: null,
      propertyReference: null,
      groupDealCode: null,
      ownerPropertyId: null,
      infraPreviewId: null,
    });
  });
});

describe('buildHrefForView', () => {
  it('builds buy list URLs with search strings', () => {
    expect(buildHrefForView('buy', { search: 'state=KA&city=Bengaluru' })).toBe(
      '/buy?state=KA&city=Bengaluru'
    );
  });

  it('builds legacy detail URLs when no slug is provided', () => {
    expect(buildHrefForView('buy-details', { buyPropertyId: '101' })).toBe('/buy-details/101');
    expect(buildHrefForView('rent-details', { rentalId: '302' })).toBe('/rent-details/302');
  });

  it('builds canonical detail URLs when a slug is provided', () => {
    expect(
      buildHrefForView('buy-details', {
        buyPropertyId: '101',
        buyPropertySlug: 'Lake View Residence',
      })
    ).toBe('/buy/lake-view-residence-101');

    expect(
      buildHrefForView('rent-details', {
        rentalId: '302',
        rentalSlug: 'River House',
      })
    ).toBe('/rent/river-house-302');
  });

  it('builds preview and owner edit fallbacks exactly', () => {
    expect(buildHrefForView('admin-infra-preview', { infraPreviewId: 'up-1' })).toBe(
      '/admin/infra/preview/up-1'
    );
    expect(buildHrefForView('admin-infra-preview')).toBe('/admin/infra/inbox');
    expect(buildHrefForView('owner-edit-property', { ownerPropertyId: 'abc' })).toBe(
      '/owner/edit-property/abc'
    );
    expect(buildHrefForView('owner-edit-property')).toBe('/owner/listings');
  });

  it('builds Dalal Coin routes with checkout search state', () => {
    expect(buildHrefForView('wallet')).toBe('/wallet');
    expect(buildHrefForView('referrals')).toBe('/referrals');
    expect(buildHrefForView('checkout', { search: 'kind=property&propertyId=42' })).toBe(
      '/checkout?kind=property&propertyId=42'
    );
  });
});

describe('route policy helpers', () => {
  it('returns the correct default private views', () => {
    expect(getDefaultPrivateView(adminUser)).toBe('admin-desk');
    expect(getDefaultPrivateView(teamUser)).toBe('team-desk');
    expect(getDefaultPrivateView(basicUser)).toBe('dashboard');
  });

  it('enforces access rules by role', () => {
    expect(canAccessView('dashboard', null)).toBe(false);
    expect(canAccessView('wallet', null)).toBe(false);
    expect(canAccessView('dashboard', basicUser)).toBe(true);
    expect(canAccessView('referrals', basicUser)).toBe(true);
    expect(canAccessView('checkout', basicUser)).toBe(true);
    expect(canAccessView('team-desk', basicUser)).toBe(false);
    expect(canAccessView('team-desk', teamUser)).toBe(true);
    expect(canAccessView('admin-desk', teamUser)).toBe(false);
    expect(canAccessView('admin-desk', adminUser)).toBe(true);
  });

  it('derives shell visibility without changing behavior', () => {
    expect(getShellVisibility('home', false)).toEqual({
      showCompanyPortalWorkspace: false,
      showHeader: true,
      hideAiChatbot: false,
      showPublicFooter: true,
      showFloatingWhatsApp: false,
    });

    expect(getShellVisibility('company-portal', true)).toEqual({
      showCompanyPortalWorkspace: true,
      showHeader: false,
      hideAiChatbot: true,
      showPublicFooter: false,
      showFloatingWhatsApp: false,
    });

    expect(getShellVisibility('company-portal', false)).toEqual({
      showCompanyPortalWorkspace: false,
      showHeader: true,
      hideAiChatbot: false,
      showPublicFooter: false,
      showFloatingWhatsApp: false,
    });

    expect(getShellVisibility('buy-details', true).showFloatingWhatsApp).toBe(true);
    expect(getShellVisibility('login', false)).toEqual({
      showCompanyPortalWorkspace: false,
      showHeader: false,
      hideAiChatbot: true,
      showPublicFooter: false,
      showFloatingWhatsApp: false,
    });
  });
});
