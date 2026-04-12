import { ShieldAlert, ShieldCheck, ShieldEllipsis, ShieldQuestion } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { VerificationBadgeData } from '@/modules/trust/api/verificationApi';

const TONE_STYLES: Record<VerificationBadgeData['tone'], string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
};
const TONE_ICONS: Record<VerificationBadgeData['tone'], typeof ShieldAlert> = {
  emerald: ShieldCheck,
  blue: ShieldEllipsis,
  amber: ShieldQuestion,
  rose: ShieldAlert,
};

export default function VerificationBadge({ badge }: { badge: VerificationBadgeData }) {
  const Icon = TONE_ICONS[badge.tone];

  return (
    <Badge variant="outline" className={TONE_STYLES[badge.tone]}>
      <Icon className="h-3.5 w-3.5" />
      {badge.label}
    </Badge>
  );
}
