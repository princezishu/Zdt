import type { ReactNode } from 'react';
import { Building2, Layers, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ModuleView = 'floor-detail' | 'builder' | 'units-list';

interface LayoutUnitsShellProps {
  activeView: ModuleView;
  title: string;
  description: string;
  onOpenFloorDetail: () => void;
  onOpenBuilder: () => void;
  onOpenUnitsList: () => void;
  children: ReactNode;
}

export default function LayoutUnitsShell({
  activeView,
  title,
  description,
  onOpenFloorDetail,
  onOpenBuilder,
  onOpenUnitsList,
  children,
}: LayoutUnitsShellProps) {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Property Management</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/85">{description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Property Management
            </p>
            <div className="space-y-2">
              <Button
                variant={activeView === 'floor-detail' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={onOpenFloorDetail}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Buildings & Floors
              </Button>
              <Button
                variant={activeView === 'builder' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={onOpenBuilder}
              >
                <Layers className="mr-2 h-4 w-4" />
                Layout & Units
              </Button>
              <Button
                variant={activeView === 'units-list' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={onOpenUnitsList}
              >
                <ListFilter className="mr-2 h-4 w-4" />
                Units List
              </Button>
            </div>
          </aside>

          <div className="space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
