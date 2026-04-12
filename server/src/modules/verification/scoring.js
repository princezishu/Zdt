function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function buildVerificationBadge(score, options = {}) {
  const normalizedScore = clamp(Number(score || 0), 0, 100);
  const openFakeReports = Math.max(0, Number(options.openFakeReports || 0));
  const isVerified = Boolean(options.isVerified);

  if (openFakeReports >= 3 || normalizedScore < 45) {
    return {
      key: 'watchlist',
      label: 'Watchlist',
      tone: 'rose',
      reason: 'Open trust flags need review.',
    };
  }

  if (normalizedScore >= 85 && isVerified) {
    return {
      key: 'trusted',
      label: 'Trusted',
      tone: 'emerald',
      reason: 'Strong verification and low trust risk.',
    };
  }

  if (normalizedScore >= 70) {
    return {
      key: 'verified',
      label: 'Verified',
      tone: 'blue',
      reason: 'Verification signals are healthy.',
    };
  }

  return {
    key: 'reviewing',
    label: 'Reviewing',
    tone: 'amber',
    reason: 'Verification is active but not fully mature yet.',
  };
}

export function computeBuilderTrustScore(metrics = {}) {
  let score = 35;

  if (metrics.isVerified) score += 22;
  score += Math.min(18, Math.max(0, Number(metrics.approvedDocuments || 0)) * 6);
  score += Math.min(16, Math.max(0, Number(metrics.approvedCases || 0)) * 4);

  if (Number(metrics.pendingCases || 0) > 0) {
    score += 4;
  }

  score -= Math.min(20, Math.max(0, Number(metrics.rejectedCases || 0)) * 5);
  score -= Math.min(24, Math.max(0, Number(metrics.openFakeReports || 0)) * 8);
  score += Math.min(5, Math.max(0, Number(metrics.projectCount || 0)));
  score += Math.min(4, Math.max(0, Number(metrics.propertyCount || 0)));

  return clamp(score, 10, 100);
}

export function computePropertyTrustScore(metrics = {}) {
  let score = 30;

  if (metrics.isVerified) score += 28;
  score += Math.min(18, Math.max(0, Number(metrics.approvedCases || 0)) * 6);
  if (metrics.companyVerified) score += 12;
  score -= Math.min(25, Math.max(0, Number(metrics.rejectedCases || 0)) * 7);
  score -= Math.min(25, Math.max(0, Number(metrics.openFakeReports || 0)) * 10);

  return clamp(score, 5, 100);
}
