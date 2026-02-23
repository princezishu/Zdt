import { useEffect, useState } from 'react';
import { Headset, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/http';
import type { CallTime, HelpConfig, HelpType } from '@/lib/workflowStore';

interface StepProgressProps {
  title: string;
  subtitle: string;
  step: number;
  totalSteps: number;
  steps: string[];
}

interface HelpBoxProps {
  help: HelpConfig;
  onChange: (next: HelpConfig) => void;
}

interface PhoneVerificationFieldProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  verifiedToken: string;
  onVerifiedTokenChange: (token: string) => void;
  purpose: 'buy' | 'sell' | 'rent' | 'schedule_visit' | 'fraud_report' | 'workflow';
  title?: string;
}

export function StepProgress({ title, subtitle, step, totalSteps, steps }: StepProgressProps) {
  const progress = Math.round((step / totalSteps) * 100);

  return (
    <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">ZDT Realty Smart Flow</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/85">{subtitle}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <Badge
            key={label}
            variant="secondary"
            className={`border px-3 py-1 text-xs ${
              index + 1 === step
                ? 'border-cyan-300/80 bg-cyan-300/20 text-white'
                : 'border-white/30 bg-white/10 text-cyan-100'
            }`}
          >
            {index + 1}. {label}
          </Badge>
        ))}
      </div>

      <div className="mt-4">
        <Progress value={progress} className="h-2 bg-white/20 [&>[data-slot=progress-indicator]]:bg-cyan-300" />
        <p className="mt-2 text-sm text-cyan-100">Step {step} of {totalSteps}</p>
      </div>
    </div>
  );
}

export function Hint({ children }: { children: string }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

export function HelpBox({ help, onChange }: HelpBoxProps) {
  const setCallTime = (value: string) => {
    onChange({ ...help, preferredCallTime: value as CallTime });
  };
  const setHelpType = (value: string) => {
    onChange({ ...help, helpType: value as HelpType });
  };

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Headset className="h-4 w-4 text-blue-700" />
            Having trouble? Our team will call and help you.
          </p>
          <p className="mt-1 text-xs text-slate-600">Enable this anytime if you want guided support.</p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          Need Help
          <Switch
            checked={help.needHelp}
            onCheckedChange={(checked) => onChange({ ...help, needHelp: checked })}
            className="data-[state=checked]:bg-blue-700"
          />
        </label>
      </div>

      {help.needHelp && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Preferred Call Time</p>
            <Select value={help.preferredCallTime} onValueChange={setCallTime}>
              <SelectTrigger className="mt-2 h-10 bg-white text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Morning">Morning</SelectItem>
                <SelectItem value="Afternoon">Afternoon</SelectItem>
                <SelectItem value="Evening">Evening</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Help Type</p>
            <Select value={help.helpType} onValueChange={setHelpType}>
              <SelectTrigger className="mt-2 h-10 bg-white text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Just call and guide me">Just call and guide me</SelectItem>
                <SelectItem value="Team should add my property for me">
                  Team should add my property for me
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {help.needHelp && help.helpType === 'Team should add my property for me' && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="inline-flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" />
            Assisted Listing Enabled
          </p>
          <p className="mt-1">Our team will call and complete your listing.</p>
        </div>
      )}
    </div>
  );
}

export function SuccessCard({
  referenceId,
  assistedListing,
}: {
  referenceId: string;
  assistedListing: boolean;
}) {
  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900">
      <p className="text-base font-semibold">Success! Your request has been submitted.</p>
      <p className="mt-1">Reference ID: {referenceId}</p>
      <p className="mt-1">We will call you soon.</p>
      {assistedListing && <p className="mt-1 font-medium">This is marked as Assisted Listing.</p>}
      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
        Safety note: Never pay anyone without verification.
      </p>
    </div>
  );
}

function normalizeLocalPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 15);
}

function isPhoneReady(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

export function PhoneVerificationField({
  phone,
  onPhoneChange,
  verifiedToken,
  onVerifiedTokenChange,
  purpose,
  title = 'Phone Verification (OTP)',
}: PhoneVerificationFieldProps) {
  const [verificationToken, setVerificationToken] = useState('');
  const [otp, setOtp] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [verifiedForPhone, setVerifiedForPhone] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const normalized = normalizeLocalPhone(phone);
    if (!normalized || !verifiedForPhone || normalized === verifiedForPhone) {
      return;
    }
    onVerifiedTokenChange('');
    setVerificationToken('');
    setOtp('');
    setStatusMessage('Phone changed. Please verify again.');
  }, [onVerifiedTokenChange, phone, verifiedForPhone]);

  const requestOtp = async () => {
    if (!isPhoneReady(phone)) {
      setErrorMessage('Enter a valid phone number before requesting OTP.');
      return;
    }

    setIsRequesting(true);
    setErrorMessage('');
    setStatusMessage('');
    setDevOtp('');
    try {
      const response = await apiRequest<{
        verificationToken: string;
        expiresInMinutes: number;
        devOtp?: string;
      }>('/workflow/public/phone-otp/request', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          purpose,
        }),
      });

      setVerificationToken(response.verificationToken);
      if (response.devOtp) {
        setDevOtp(response.devOtp);
      }
      setStatusMessage(`OTP sent. It expires in ${response.expiresInMinutes} minutes.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send OTP.');
    } finally {
      setIsRequesting(false);
    }
  };

  const verifyOtp = async () => {
    if (!verificationToken) {
      setErrorMessage('Request OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setErrorMessage('Enter a valid 6-digit OTP.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const response = await apiRequest<{ verificationId: string }>(
        '/workflow/public/phone-otp/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            phone,
            verificationToken,
            otp,
          }),
        }
      );

      onVerifiedTokenChange(response.verificationId);
      setVerifiedForPhone(normalizeLocalPhone(phone));
      setStatusMessage('Phone verified successfully.');
      setDevOtp('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to verify OTP.');
    } finally {
      setIsVerifying(false);
    }
  };

  const isVerified = Boolean(verifiedToken && normalizeLocalPhone(phone) === verifiedForPhone);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</p>
        {isVerified ? (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Verified</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            Not Verified
          </Badge>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={phone}
          onChange={(event) => onPhoneChange(normalizeLocalPhone(event.target.value))}
          placeholder="Phone Number"
          className="h-11 bg-white"
        />
        <Button
          type="button"
          variant="outline"
          onClick={requestOtp}
          disabled={isRequesting || !isPhoneReady(phone)}
          className="h-11 border-slate-300"
        >
          {isRequesting ? 'Sending OTP...' : 'Send OTP'}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter 6-digit OTP"
          className="h-11 bg-white"
        />
        <Button
          type="button"
          onClick={verifyOtp}
          disabled={isVerifying || isVerified}
          className="h-11 bg-blue-700 text-white hover:bg-blue-800"
        >
          {isVerified ? 'Verified' : isVerifying ? 'Verifying...' : 'Verify OTP'}
        </Button>
      </div>

      {devOtp && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Dev OTP: {devOtp}
        </p>
      )}
      {statusMessage && (
        <p className="mt-2 text-xs font-medium text-emerald-700">{statusMessage}</p>
      )}
      {errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}
