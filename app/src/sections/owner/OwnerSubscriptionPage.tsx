import { CheckCircle2, Crown, Rocket, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';

interface OwnerSubscriptionPageProps {
  onOpenDashboard: () => void;
  onOpenPayments: () => void;
}

const plans = [
  {
    name: 'Free',
    price: 0,
    description: '2 listings, limited visibility.',
    icon: <Shield className="h-5 w-5" />,
    features: ['2 listings', 'Basic lead alerts', 'Standard support'],
  },
  {
    name: 'Pro',
    price: 2499,
    description: 'Unlimited listings + analytics.',
    icon: <Rocket className="h-5 w-5" />,
    features: ['Unlimited listings', 'Lead insights', 'Priority support'],
  },
  {
    name: 'Premium',
    price: 4999,
    description: 'Featured listings + homepage spotlight.',
    icon: <Crown className="h-5 w-5" />,
    features: ['Featured listing boost', 'Homepage spotlight', 'Priority ranking'],
  },
];

export default function OwnerSubscriptionPage({
  onOpenDashboard,
  onOpenPayments,
}: OwnerSubscriptionPageProps) {
  const subscribe = async (planName: string, price: number) => {
    try {
      await apiRequest('/api/owner/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          planName,
          price,
        }),
      });
      toast.success(`${planName} plan activated`);
      onOpenPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to activate plan');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Subscription</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Upgrade your growth</h1>
            <p className="mt-2 text-sm text-slate-600">Choose the plan that matches your portfolio ambition.</p>
          </div>
          <Button variant="outline" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {plan.icon}
                {plan.name}
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {plan.price === 0 ? 'Free' : `INR ${plan.price.toLocaleString('en-IN')}`}
                <span className="text-xs text-slate-500"> / month</span>
              </p>
              <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className="mt-5 w-full bg-blue-700 text-white hover:bg-blue-800" onClick={() => subscribe(plan.name, plan.price)}>
                Choose {plan.name}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
