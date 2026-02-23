
import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createProjectConstructionUpdate,
  getProject,
  listManageProjectConstructionUpdates,
  listProjectConstructionUpdates,
  reviewProjectConstructionUpdate,
  updateProjectConstruction,
  type ConstructionMilestone,
  type ConstructionMilestoneStatus,
  type ConstructionScheduleStatus,
  type ConstructionUpdate,
  type Project,
} from '@/lib/realtyApi';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import type { AuthUser } from '@/lib/session';

interface ProjectDetailsPageProps {
  projectId: number;
  token?: string;
  user: AuthUser | null;
  onBack: () => void;
  onOpenCompany: (companyId: number) => void;
}

const milestoneTemplate: Array<{ key: string; label: string }> = [
  { key: 'land_approvals', label: 'Land & approvals' },
  { key: 'excavation', label: 'Excavation' },
  { key: 'foundation', label: 'Foundation' },
  { key: 'structure_slabs', label: 'Structure / slabs' },
  { key: 'brickwork', label: 'Brickwork' },
  { key: 'electrical_plumbing', label: 'Electrical & plumbing' },
  { key: 'plastering_flooring', label: 'Plastering & flooring' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'handover', label: 'Handover' },
];

function formatMoney(value: number | null): string {
  if (!value || value <= 0) return 'On request';
  return `Rs ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return 'Not updated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not updated';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeMilestones(milestones: ConstructionMilestone[] | undefined): ConstructionMilestone[] {
  const byKey = new Map((milestones || []).map((milestone) => [milestone.key, milestone]));
  return milestoneTemplate.map((template) => {
    const existing = byKey.get(template.key);
    return {
      key: template.key,
      label: template.label,
      status: existing?.status || 'upcoming',
      statusLabel: existing?.statusLabel || 'Upcoming',
      completionDate: existing?.completionDate || null,
    };
  });
}

function statusBadgeClasses(status: string): string {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Near Completion') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Under Construction') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'Approved') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function updateBadgeClasses(status: string): string {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function ProjectDetailsPage({
  projectId,
  token = '',
  onBack,
  onOpenCompany,
}: ProjectDetailsPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [approvedUpdates, setApprovedUpdates] = useState<ConstructionUpdate[]>([]);
  const [manageUpdates, setManageUpdates] = useState<ConstructionUpdate[]>([]);
  const [canManageConstruction, setCanManageConstruction] = useState(false);
  const [canModerateUpdates, setCanModerateUpdates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingManage, setLoadingManage] = useState(false);
  const [error, setError] = useState('');
  const [manageError, setManageError] = useState('');
  const [message, setMessage] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [reviewingUpdateId, setReviewingUpdateId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const [overallStatus, setOverallStatus] = useState<
    'Planning' | 'Approved' | 'Under Construction' | 'Near Completion' | 'Completed'
  >('Planning');
  const [completionPercentInput, setCompletionPercentInput] = useState('0');
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<ConstructionScheduleStatus>('on_schedule');
  const [delayReason, setDelayReason] = useState('');
  const [milestoneDraft, setMilestoneDraft] = useState<
    Array<{ key: string; status: ConstructionMilestoneStatus; completionDate: string }>
  >([]);

  const [updateTitle, setUpdateTitle] = useState('');
  const [updateDescription, setUpdateDescription] = useState('');
  const [updatePhotoUrls, setUpdatePhotoUrls] = useState<string[]>([]);

  const construction = useMemo(() => {
    const fallbackMilestones = normalizeMilestones(project?.construction?.milestones);
    const completionPercent = Math.max(
      0,
      Math.min(100, Math.round(Number(project?.construction?.completionPercent || 0)))
    );
    return {
      overallStatus: project?.construction?.overallStatus || 'Planning',
      completionPercent,
      milestones: fallbackMilestones,
      lastUpdatedAt: project?.construction?.lastUpdatedAt || null,
      estimatedCompletionDate: project?.construction?.estimatedCompletionDate || null,
      scheduleStatus: project?.construction?.scheduleStatus || 'on_schedule',
      scheduleStatusLabel: project?.construction?.scheduleStatusLabel || 'On schedule',
      delayReason: project?.construction?.delayReason || '',
      latestUpdate: project?.construction?.latestUpdate || null,
      updatesCount: Number(project?.construction?.updatesCount || 0),
      disclosure:
        project?.construction?.disclosure ||
        'Construction updates are provided by the project developer and verified by ZDT Realty.',
    };
  }, [project]);

  const latestPublicUpdate = construction.latestUpdate || approvedUpdates[0] || null;
  const pendingUpdates = manageUpdates.filter((update) => update.approvalStatus === 'pending');
  const nonApprovedUpdates = manageUpdates.filter((update) => update.approvalStatus !== 'approved');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([getProject(projectId), listProjectConstructionUpdates(projectId)])
      .then(([projectValue, updates]) => {
        if (!active) return;
        setProject(projectValue);
        setApprovedUpdates(updates);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load project');
        setProject(null);
        setApprovedUpdates([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    setOverallStatus(
      (project.construction?.overallStatus as
        | 'Planning'
        | 'Approved'
        | 'Under Construction'
        | 'Near Completion'
        | 'Completed') || 'Planning'
    );
    setCompletionPercentInput(String(Math.max(0, Math.min(100, project.construction?.completionPercent || 0))));
    setEstimatedCompletionDate(toDateInputValue(project.construction?.estimatedCompletionDate));
    setScheduleStatus((project.construction?.scheduleStatus as ConstructionScheduleStatus) || 'on_schedule');
    setDelayReason(project.construction?.delayReason || '');
    setMilestoneDraft(
      normalizeMilestones(project.construction?.milestones).map((milestone) => ({
        key: milestone.key,
        status: milestone.status,
        completionDate: milestone.completionDate || '',
      }))
    );
  }, [project]);

  useEffect(() => {
    let active = true;
    if (!project || !token) {
      setCanManageConstruction(false);
      setManageUpdates([]);
      setCanModerateUpdates(false);
      setManageError('');
      setLoadingManage(false);
      return () => {
        active = false;
      };
    }

    setLoadingManage(true);
    setManageError('');
    listManageProjectConstructionUpdates(project.id, token, 'all')
      .then((response) => {
        if (!active) return;
        setCanManageConstruction(true);
        setManageUpdates(response.updates || []);
        setCanModerateUpdates(Boolean(response.canModerate));
      })
      .catch((loadError) => {
        if (!active) return;
        setCanManageConstruction(false);
        setManageUpdates([]);
        setCanModerateUpdates(false);
        const message = loadError instanceof Error ? loadError.message : 'Unable to load internal updates';
        const isAccessError =
          /access|forbidden|not authorized|not allowed|do not have access/i.test(message);
        setManageError(isAccessError ? '' : message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingManage(false);
      });

    return () => {
      active = false;
    };
  }, [project, token]);

  const refreshProgressData = async (targetProjectId: number) => {
    const [projectValue, publicUpdates] = await Promise.all([
      getProject(targetProjectId),
      listProjectConstructionUpdates(targetProjectId),
    ]);
    setProject(projectValue);
    setApprovedUpdates(publicUpdates);

    if (!token) {
      setCanManageConstruction(false);
      setManageUpdates([]);
      setCanModerateUpdates(false);
      return;
    }

    try {
      const managed = await listManageProjectConstructionUpdates(targetProjectId, token, 'all');
      setCanManageConstruction(true);
      setManageUpdates(managed.updates || []);
      setCanModerateUpdates(Boolean(managed.canModerate));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load internal updates';
      const isAccessError =
        /access|forbidden|not authorized|not allowed|do not have access/i.test(message);
      setCanManageConstruction(false);
      setManageUpdates([]);
      setCanModerateUpdates(false);
      if (!isAccessError) {
        setManageError(message);
      }
    }
  };

  const handleSaveConstructionSummary = async () => {
    if (!token || !project) return;
    setError('');
    setManageError('');
    setMessage('');

    const percent = Number(completionPercentInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError('Completion percentage must be between 0 and 100.');
      return;
    }
    if ((scheduleStatus === 'slight_delay' || scheduleStatus === 'major_delay') && !delayReason.trim()) {
      setError('Delay reason is required for delayed schedules.');
      return;
    }
    const invalidMilestoneDate = milestoneDraft.find(
      (item) => item.status === 'completed' && item.completionDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.completionDate)
    );
    if (invalidMilestoneDate) {
      setError('Milestone completion date must use YYYY-MM-DD format.');
      return;
    }

    setSavingSummary(true);
    try {
      const updatedProject = await updateProjectConstruction(
        project.id,
        {
          overallStatus,
          completionPercent: Math.round(percent),
          estimatedCompletionDate: estimatedCompletionDate || null,
          scheduleStatus,
          delayReason: delayReason.trim(),
          milestones: milestoneDraft.map((item) => ({
            key: item.key,
            status: item.status,
            completionDate: item.status === 'completed' ? item.completionDate || null : null,
          })),
        },
        token
      );
      setProject(updatedProject);
      await refreshProgressData(project.id);
      setMessage('Construction summary updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update construction summary');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleConstructionPhotoUpload = async (files: FileList | null) => {
    if (!token || !files || files.length === 0) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (selected.length === 0) {
      setError('Please choose image files only.');
      return;
    }
    if (updatePhotoUrls.length + selected.length > 6) {
      setError('You can upload a maximum of 6 photos per update.');
      return;
    }

    setError('');
    setUploadingPhotos(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const response = await uploadImageFile(token, 'realty_project', file, {
          maxSide: 1800,
          mimeType: 'image/webp',
          quality: 0.9,
        });
        uploaded.push(response.imageUrl);
      }
      setUpdatePhotoUrls((current) => [...current, ...uploaded].slice(0, 6));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload progress photos');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleCreateProgressUpdate = async () => {
    if (!token || !project) return;
    setError('');
    setMessage('');
    if (!updateTitle.trim()) {
      setError('Update title is required.');
      return;
    }
    if (updatePhotoUrls.length < 3 || updatePhotoUrls.length > 6) {
      setError('Please upload 3 to 6 real site photos.');
      return;
    }

    setSubmittingUpdate(true);
    try {
      await createProjectConstructionUpdate(
        project.id,
        {
          title: updateTitle.trim(),
          description: updateDescription.trim(),
          photoUrls: updatePhotoUrls,
        },
        token
      );
      setUpdateTitle('');
      setUpdateDescription('');
      setUpdatePhotoUrls([]);
      await refreshProgressData(project.id);
      setMessage('Progress update submitted for admin verification.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit progress update');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleReviewUpdate = async (updateId: number, decision: 'approved' | 'rejected') => {
    if (!token || !project) return;
    setError('');
    setManageError('');
    setReviewingUpdateId(updateId);
    try {
      await reviewProjectConstructionUpdate(
        project.id,
        updateId,
        {
          decision,
          note: reviewNotes[updateId] || '',
        },
        token
      );
      await refreshProgressData(project.id);
    } catch (reviewError) {
      setManageError(reviewError instanceof Error ? reviewError.message : 'Unable to review update');
    } finally {
      setReviewingUpdateId(null);
    }
  };

  if (loading) {
    return (
      <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
        <div className="page-container">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Loading project details...
          </div>
        </div>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
        <div className="page-container space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || 'Project not found.'}
          </div>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
      <div className="page-container space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {manageError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {manageError}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-56 bg-slate-200 sm:h-72">
            {project.primaryImage ? (
              <img src={project.primaryImage} alt={project.projectName} className="h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusBadgeClasses(construction.overallStatus)}`}
              >
                {construction.overallStatus}
              </span>
              <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{project.projectName}</h1>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <div>
                <p className="inline-flex items-center gap-1 text-sm text-slate-600">
                  <MapPin className="h-4 w-4" />
                  {[project.area, project.city, project.state].filter(Boolean).join(', ')}
                </p>
                <p className="mt-1 text-sm text-slate-600">{project.fullAddress}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price Range</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatMoney(project.priceMin)} - {formatMoney(project.priceMax)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Per Sqft</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(project.pricePerSqft)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Possession</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    {project.possessionDate || 'TBD'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Configurations</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {project.configurations.length > 0 ? project.configurations.join(', ') : 'N/A'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total Units</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{project.totalUnits ?? 'N/A'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total Floors</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{project.totalFloors ?? 'N/A'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Highlights</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {project.highlights || 'Project highlights will be updated soon.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-slate-900">Construction Progress</p>
                  <p className="text-sm font-semibold text-blue-900">{construction.completionPercent}% Completed</p>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${construction.completionPercent}%` }}
                  />
                </div>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600">
                  <Clock3 className="h-3.5 w-3.5" />
                  Last updated: {formatDateLabel(construction.lastUpdatedAt)}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Current Status</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{construction.overallStatus}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Estimated Completion</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatDateLabel(construction.estimatedCompletionDate)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Schedule</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{construction.scheduleStatusLabel}</p>
                  </div>
                </div>

                {construction.scheduleStatus !== 'on_schedule' && construction.delayReason ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Delay explanation</p>
                    <p className="mt-1">{construction.delayReason}</p>
                  </div>
                ) : null}

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[1fr_140px_140px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <p>Milestone</p>
                    <p>Status</p>
                    <p>Completion Date</p>
                  </div>
                  {construction.milestones.map((milestone) => (
                    <div
                      key={milestone.key}
                      className="grid grid-cols-[1fr_140px_140px] items-center border-b border-slate-100 px-3 py-2 text-sm text-slate-700 last:border-b-0"
                    >
                      <p>{milestone.label}</p>
                      <p className="font-medium">{milestone.statusLabel}</p>
                      <p>{formatDateLabel(milestone.completionDate)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Latest Update</p>
                  {latestPublicUpdate ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{latestPublicUpdate.title}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${updateBadgeClasses(
                            latestPublicUpdate.approvalStatus
                          )}`}
                        >
                          {latestPublicUpdate.approvalStatus}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{latestPublicUpdate.description || 'No description.'}</p>
                      <p className="text-xs text-slate-500">
                        Updated on {formatDateLabel(latestPublicUpdate.createdAt)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {latestPublicUpdate.photoUrls.map((url, index) => (
                          <img
                            key={`${latestPublicUpdate.id}-${index}`}
                            src={url}
                            alt={`${latestPublicUpdate.title} ${index + 1}`}
                            className="h-28 w-full rounded-lg border border-slate-200 object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">No approved construction updates yet.</p>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Progress Updates Gallery</p>
                  {approvedUpdates.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">No approved progress updates available yet.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {approvedUpdates.map((update) => (
                        <article key={update.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{update.title}</p>
                            <p className="text-xs text-slate-500">{formatDateLabel(update.createdAt)}</p>
                          </div>
                          {update.description ? (
                            <p className="mt-1 text-sm text-slate-700">{update.description}</p>
                          ) : null}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {update.photoUrls.map((url, index) => (
                              <img
                                key={`${update.id}-${index}`}
                                src={url}
                                alt={`${update.title} ${index + 1}`}
                                className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                                loading="lazy"
                              />
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {construction.disclosure}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Amenities</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.amenities.length > 0 ? (
                    project.amenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                      >
                        {amenity}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">Amenities not listed yet.</p>
                  )}
                </div>
              </div>

              {canManageConstruction ? (
                <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-base font-semibold text-slate-900">Builder Progress Controls</p>
                  <p className="text-sm text-slate-700">
                    You can update status, milestones, and add new progress updates. Existing updates are immutable.
                  </p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Overall Status
                      </p>
                      <select
                        value={overallStatus}
                        onChange={(event) =>
                          setOverallStatus(
                            event.target.value as
                              | 'Planning'
                              | 'Approved'
                              | 'Under Construction'
                              | 'Near Completion'
                              | 'Completed'
                          )
                        }
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="Planning">Planning</option>
                        <option value="Approved">Approved</option>
                        <option value="Under Construction">Under Construction</option>
                        <option value="Near Completion">Near Completion</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Completion %
                      </p>
                      <Input
                        value={completionPercentInput}
                        onChange={(event) => setCompletionPercentInput(event.target.value.replace(/[^\d]/g, ''))}
                        placeholder="0-100"
                        className="h-11 bg-white"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Estimated Completion Date
                      </p>
                      <Input
                        type="date"
                        value={estimatedCompletionDate}
                        onChange={(event) => setEstimatedCompletionDate(event.target.value)}
                        className="h-11 bg-white"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Schedule Status
                      </p>
                      <select
                        value={scheduleStatus}
                        onChange={(event) =>
                          setScheduleStatus(event.target.value as ConstructionScheduleStatus)
                        }
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="on_schedule">On schedule</option>
                        <option value="slight_delay">Slight delay</option>
                        <option value="major_delay">Major delay</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Delay Reason (required if delayed)
                    </p>
                    <Textarea
                      value={delayReason}
                      onChange={(event) => setDelayReason(event.target.value)}
                      placeholder="Explain delay reason if schedule is delayed"
                      className="min-h-[80px] bg-white"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">Milestones</p>
                    {milestoneTemplate.map((milestone) => {
                      const current = milestoneDraft.find((item) => item.key === milestone.key) || {
                        key: milestone.key,
                        status: 'upcoming' as ConstructionMilestoneStatus,
                        completionDate: '',
                      };
                      return (
                        <div
                          key={milestone.key}
                          className="grid gap-2 border-b border-slate-100 pb-2 text-sm last:border-b-0 last:pb-0 sm:grid-cols-[1fr_180px_180px]"
                        >
                          <p className="self-center text-slate-800">{milestone.label}</p>
                          <select
                            value={current.status}
                            onChange={(event) =>
                              setMilestoneDraft((prev) =>
                                milestoneTemplate.map((template) => {
                                  const existing =
                                    prev.find((item) => item.key === template.key) || {
                                      key: template.key,
                                      status: 'upcoming' as ConstructionMilestoneStatus,
                                      completionDate: '',
                                    };
                                  if (template.key !== milestone.key) return existing;
                                  const nextStatus = event.target.value as ConstructionMilestoneStatus;
                                  return {
                                    ...existing,
                                    status: nextStatus,
                                    completionDate:
                                      nextStatus === 'completed' ? existing.completionDate : '',
                                  };
                                })
                              )
                            }
                            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                          >
                            <option value="upcoming">Upcoming</option>
                            <option value="in_progress">In progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          <Input
                            type="date"
                            value={current.completionDate}
                            onChange={(event) =>
                              setMilestoneDraft((prev) =>
                                milestoneTemplate.map((template) => {
                                  const existing =
                                    prev.find((item) => item.key === template.key) || {
                                      key: template.key,
                                      status: 'upcoming' as ConstructionMilestoneStatus,
                                      completionDate: '',
                                    };
                                  if (template.key !== milestone.key) return existing;
                                  return {
                                    ...existing,
                                    completionDate: event.target.value,
                                  };
                                })
                              )
                            }
                            className="h-10 bg-white"
                            disabled={current.status !== 'completed'}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    onClick={handleSaveConstructionSummary}
                    disabled={savingSummary}
                    className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                  >
                    {savingSummary ? 'Saving...' : 'Save Construction Summary'}
                  </Button>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">Add Progress Update</p>
                    <Input
                      value={updateTitle}
                      onChange={(event) => setUpdateTitle(event.target.value)}
                      placeholder="Update title (e.g., 3rd floor slab completed)"
                      className="h-11 bg-white"
                    />
                    <Textarea
                      value={updateDescription}
                      onChange={(event) => setUpdateDescription(event.target.value)}
                      placeholder="Short description (1-2 lines)"
                      className="min-h-[80px] bg-white"
                    />
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => {
                          void handleConstructionPhotoUpload(event.target.files);
                          event.currentTarget.value = '';
                        }}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
                      />
                      <p className="text-xs text-slate-500">Upload 3 to 6 real site photos.</p>
                      {updatePhotoUrls.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {updatePhotoUrls.map((url, index) => (
                            <div key={`${url}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                              <img
                                src={url}
                                alt={`Progress photo ${index + 1}`}
                                className="h-24 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setUpdatePhotoUrls((current) =>
                                    current.filter((_, itemIndex) => itemIndex !== index)
                                  )
                                }
                                className="absolute right-1 top-1 rounded-full border border-white/80 bg-black/60 px-2 py-0.5 text-[11px] text-white"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      onClick={handleCreateProgressUpdate}
                      disabled={uploadingPhotos || submittingUpdate}
                      className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                    >
                      {uploadingPhotos
                        ? 'Uploading photos...'
                        : submittingUpdate
                          ? 'Submitting update...'
                          : 'Submit Progress Update'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {canManageConstruction && nonApprovedUpdates.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Internal Update Queue</p>
                  {loadingManage ? <p className="mt-2 text-sm text-slate-600">Loading internal updates...</p> : null}
                  <div className="mt-3 space-y-3">
                    {nonApprovedUpdates.map((update) => (
                      <article key={update.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{update.title}</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${updateBadgeClasses(
                              update.approvalStatus
                            )}`}
                          >
                            {update.approvalStatus}
                          </span>
                        </div>
                        {update.description ? (
                          <p className="mt-1 text-sm text-slate-700">{update.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          Submitted on {formatDateLabel(update.createdAt)}
                        </p>
                        {update.reviewNote ? (
                          <p className="mt-1 text-xs text-slate-600">Review note: {update.reviewNote}</p>
                        ) : null}
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {update.photoUrls.map((url, index) => (
                            <img
                              key={`${update.id}-${index}`}
                              src={url}
                              alt={`${update.title} ${index + 1}`}
                              className="h-20 w-full rounded-lg border border-slate-200 object-cover"
                              loading="lazy"
                            />
                          ))}
                        </div>

                        {canModerateUpdates && update.approvalStatus === 'pending' ? (
                          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                            <Textarea
                              value={reviewNotes[update.id] || ''}
                              onChange={(event) =>
                                setReviewNotes((prev) => ({ ...prev, [update.id]: event.target.value }))
                              }
                              placeholder="Optional review note"
                              className="min-h-[70px] bg-white"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={reviewingUpdateId === update.id}
                                onClick={() => void handleReviewUpdate(update.id, 'approved')}
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewingUpdateId === update.id}
                                onClick={() => void handleReviewUpdate(update.id, 'rejected')}
                                className="border-red-300 text-red-700 hover:bg-red-50"
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {canModerateUpdates && pendingUpdates.length === 0 && !loadingManage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  All submitted progress updates are reviewed.
                </div>
              ) : null}
            </div>

            <aside className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Company</p>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {project.company?.logoUrl ? (
                    <img
                      src={project.company.logoUrl}
                      alt={project.company.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{project.company?.name || 'Company'}</p>
                  {project.company?.isVerified ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Verified
                    </p>
                  ) : null}
                </div>
              </div>

              {project.company ? (
                <Button
                  onClick={() => onOpenCompany(project.company?.id || project.companyId)}
                  className="h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                >
                  View Company Profile
                </Button>
              ) : null}

              {project.brochureUrl ? (
                <a
                  href={project.brochureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Open Brochure
                </a>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <p className="inline-flex items-start gap-1.5">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-slate-500" />
                  <span>{construction.disclosure}</span>
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
