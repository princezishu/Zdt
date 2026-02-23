import { Skeleton } from '@/components/ui/skeleton';

interface CountProps {
  count?: number;
}

function StatCardsSkeleton({ count = 4 }: CountProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`stat-skeleton-${index}`}
          className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
        >
          <Skeleton className="h-3 w-24 bg-slate-200" />
          <Skeleton className="mt-3 h-7 w-16 bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function RoutePageSkeleton() {
  return (
    <div className="page-container py-14">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-4 w-28 bg-slate-200" />
        <Skeleton className="h-8 w-1/2 bg-slate-200" />
        <Skeleton className="h-4 w-2/3 bg-slate-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 bg-slate-200" />
          <Skeleton className="h-32 bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

export function PropertyCardsSkeleton({ count = 8 }: CountProps) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`property-card-skeleton-${index}`}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <Skeleton className="h-40 w-full rounded-none bg-slate-200" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-20 bg-slate-200" />
            <Skeleton className="h-4 w-3/4 bg-slate-200" />
            <Skeleton className="h-4 w-1/2 bg-slate-200" />
            <Skeleton className="h-3 w-2/3 bg-slate-200" />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Skeleton className="h-9 bg-slate-200" />
              <Skeleton className="h-9 bg-slate-200" />
              <Skeleton className="col-span-2 h-9 bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mt-8 space-y-8">
      <StatCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <Skeleton className="h-6 w-56 bg-slate-200" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`dashboard-row-skeleton-${index}`}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <Skeleton className="h-4 w-2/3 bg-slate-200" />
                <Skeleton className="mt-2 h-3 w-1/2 bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <Skeleton className="h-6 w-40 bg-slate-200" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`dashboard-account-skeleton-${index}`} className="h-16 bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="page-container space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex items-start gap-4">
              <Skeleton className="h-20 w-20 rounded-2xl bg-slate-200" />
              <div className="w-full space-y-2">
                <Skeleton className="h-3 w-36 bg-slate-200" />
                <Skeleton className="h-8 w-56 bg-slate-200" />
                <Skeleton className="h-4 w-44 bg-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`profile-hero-stat-${index}`} className="h-20 bg-slate-200" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.75fr_1fr]">
          <Skeleton className="h-72 bg-slate-200" />
          <Skeleton className="h-72 bg-slate-200" />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2 bg-slate-200" />
          <Skeleton className="h-80 bg-slate-200" />
        </div>
      </div>
    </section>
  );
}

export function TeamDeskSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`team-chip-skeleton-${index}`} className="h-8 bg-slate-200" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-10 w-full bg-slate-200" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`team-row-skeleton-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Skeleton className="h-4 w-2/3 bg-slate-200" />
            <Skeleton className="mt-2 h-3 w-1/2 bg-slate-200" />
            <Skeleton className="mt-3 h-10 w-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminDeskSkeleton() {
  return (
    <div className="space-y-4">
      <StatCardsSkeleton count={6} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-6 w-64 bg-slate-200" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`admin-row-skeleton-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Skeleton className="h-4 w-2/3 bg-slate-200" />
            <Skeleton className="mt-2 h-3 w-1/2 bg-slate-200" />
            <Skeleton className="mt-3 h-10 w-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
