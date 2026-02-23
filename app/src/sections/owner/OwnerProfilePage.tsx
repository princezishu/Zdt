import { useEffect, useState } from 'react';
import { BadgeCheck, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface OwnerProfilePageProps {
  onOpenDashboard: () => void;
}

interface OwnerProfileResponse {
  profile: {
    displayName: string;
    profilePhotoUrl: string;
    kycDocumentUrl: string;
    about: string;
    bankName: string;
    bankAccount: string;
    bankIfsc: string;
    kycVerified: boolean;
    totalListings: number;
    subscriptionPlan: string;
    email: string;
    phone: string;
  };
}

export default function OwnerProfilePage({ onOpenDashboard }: OwnerProfilePageProps) {
  const [profile, setProfile] = useState<OwnerProfileResponse['profile'] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<OwnerProfileResponse>('/api/owner/profile')
      .then((response) => setProfile(response.profile))
      .catch(() => setProfile(null));
  }, []);

  const updateProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await apiRequest('/api/owner/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: profile.displayName,
          profilePhotoUrl: profile.profilePhotoUrl,
          kycDocumentUrl: profile.kycDocumentUrl,
          about: profile.about,
          bankName: profile.bankName,
          bankAccount: profile.bankAccount,
          bankIfsc: profile.bankIfsc,
        }),
      });
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update profile');
    } finally {
      setSaving(false);
    }
  };

  const uploadKyc = async (file: File) => {
    const formData = new FormData();
    formData.append('purpose', 'owner_kyc');
    formData.append('file', file);
    const response = await apiRequest<{ imageUrl: string }>('/auth/media/upload-image', {
      method: 'POST',
      body: formData,
    });
    setProfile((prev) => (prev ? { ...prev, kycDocumentUrl: response.imageUrl } : prev));
    toast.success('KYC document uploaded');
  };

  if (!profile) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading owner profile...
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Profile</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Your public presence</h1>
            <p className="mt-2 text-sm text-slate-600">KYC verified badge, ratings, and payout settings.</p>
          </div>
          <Button variant="outline" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-200">
                <img
                  src={profile.profilePhotoUrl || '/images/people/owner-1.jpg'}
                  alt="Owner profile"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Camera className="h-4 w-4" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{profile.displayName || 'Owner'}</p>
                <p className="text-sm text-slate-500">{profile.email}</p>
                <p className="text-xs text-slate-500">{profile.phone || 'Phone not added'}</p>
              </div>
              {profile.kycVerified && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  KYC Verified
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Display Name</label>
                <Input
                  value={profile.displayName}
                  onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
                  className="mt-2 h-10"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Profile Photo URL</label>
                <Input
                  value={profile.profilePhotoUrl}
                  onChange={(event) => setProfile({ ...profile, profilePhotoUrl: event.target.value })}
                  className="mt-2 h-10"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">About</label>
                <Textarea
                  value={profile.about}
                  onChange={(event) => setProfile({ ...profile, about: event.target.value })}
                  className="mt-2 min-h-24"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Bank Details for Payouts</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Bank Name</label>
                <Input
                  value={profile.bankName}
                  onChange={(event) => setProfile({ ...profile, bankName: event.target.value })}
                  className="mt-2 h-10"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Account Number</label>
                <Input
                  value={profile.bankAccount}
                  onChange={(event) => setProfile({ ...profile, bankAccount: event.target.value })}
                  className="mt-2 h-10"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">IFSC Code</label>
                <Input
                  value={profile.bankIfsc}
                  onChange={(event) => setProfile({ ...profile, bankIfsc: event.target.value })}
                  className="mt-2 h-10"
                />
              </div>
              <Button className="w-full bg-blue-700 text-white hover:bg-blue-800" onClick={updateProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-500">KYC Document</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadKyc(file);
                    }
                  }}
                />
                {profile.kycDocumentUrl && (
                  <a className="text-xs text-blue-700 underline" href={profile.kycDocumentUrl} target="_blank" rel="noreferrer">
                    View uploaded KYC document
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
