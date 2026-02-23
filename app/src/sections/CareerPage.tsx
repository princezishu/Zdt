import { useEffect, useState } from 'react';
import { BriefcaseBusiness, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest } from '@/lib/http';

type CareerPosition = 'Admin' | 'Team Member';

interface CareerResponse {
  message: string;
  referenceId: string;
  registrationNumber: string;
}

interface CareerAvailabilityResponse {
  adminSeats?: {
    used?: number;
    max?: number;
    isFull?: boolean;
  };
}

interface CareerPageProps {
  lockedPosition?: CareerPosition;
}

const SECURITY_QUESTIONS = [
  'What is your place of birth?',
  'What is your birth year?',
  "What is your best friend's name?",
  'Who is your favorite person close to your heart?',
] as const;

export default function CareerPage({ lockedPosition }: CareerPageProps) {
  const [position, setPosition] = useState<CareerPosition>(lockedPosition ?? 'Team Member');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [city, setCity] = useState('');
  const [securityQuestionOne, setSecurityQuestionOne] = useState<string>(SECURITY_QUESTIONS[0]);
  const [securityAnswerOne, setSecurityAnswerOne] = useState('');
  const [securityQuestionTwo, setSecurityQuestionTwo] = useState<string>(SECURITY_QUESTIONS[1]);
  const [securityAnswerTwo, setSecurityAnswerTwo] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [teamSpecialization, setTeamSpecialization] = useState('');
  const [teamPreferredShift, setTeamPreferredShift] = useState('');
  const [experience, setExperience] = useState('');
  const [whyHireYou, setWhyHireYou] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [generatedRegistrationNumber, setGeneratedRegistrationNumber] = useState('');
  const [adminApplicationsClosed, setAdminApplicationsClosed] = useState(false);
  const [adminSeatUsage, setAdminSeatUsage] = useState<{ used: number; max: number } | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

  useEffect(() => {
    let active = true;

    const loadAvailability = async () => {
      try {
        const response = await apiRequest<CareerAvailabilityResponse>('/workflow/careers/availability');
        if (!active) {
          return;
        }

        const used = Number(response.adminSeats?.used || 0);
        const max = Number(response.adminSeats?.max || 2);
        const isFull = response.adminSeats?.isFull ?? used >= max;

        setAdminSeatUsage({ used, max });
        setAdminApplicationsClosed(Boolean(isFull));
      } catch {
        if (!active) {
          return;
        }
        setAdminApplicationsClosed(false);
        setAdminSeatUsage(null);
      } finally {
        if (active) {
          setIsLoadingAvailability(false);
        }
      }
    };

    void loadAvailability();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (lockedPosition || !adminApplicationsClosed || position !== 'Admin') {
      return;
    }
    setPosition('Team Member');
  }, [lockedPosition, adminApplicationsClosed, position]);

  const showAdminApplyOption = !lockedPosition && !adminApplicationsClosed;
  const showAdminLockedNotice = lockedPosition === 'Admin' && adminApplicationsClosed;

  const submitApplication = async () => {
    setError('');
    setReferenceId('');
    setGeneratedRegistrationNumber('');
    if (!fullName.trim()) {
      setError('Full Name is required.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      setError('Valid Phone Number is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Valid Email is required.');
      return;
    }
    if (!city.trim()) {
      setError('City is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }
    if (!securityAnswerOne.trim()) {
      setError('Security Answer 1 is required.');
      return;
    }
    if (!securityAnswerTwo.trim()) {
      setError('Security Answer 2 is required.');
      return;
    }
    if (securityQuestionOne === securityQuestionTwo) {
      setError('Security Question 1 and Security Question 2 must be different.');
      return;
    }
    if (!whyHireYou.trim() || whyHireYou.trim().length < 10) {
      setError('Why should we hire you? must be at least 10 characters.');
      return;
    }
    if (position === 'Admin' && adminApplicationsClosed) {
      setError('Admin applications are currently closed because all admin seats are full.');
      return;
    }

    if (position === 'Admin') {
      if (!/^\d{12}$/.test(aadhaarNumber.replace(/\D/g, ''))) {
        setError('Admin application requires a valid 12-digit Aadhaar number.');
        return;
      }
      if (!/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/.test(panNumber.trim())) {
        setError('Admin application requires a valid PAN number.');
        return;
      }
    } else {
      if (!teamSpecialization.trim()) {
        setError('Team member application requires specialization.');
        return;
      }
      if (!teamPreferredShift.trim()) {
        setError('Team member application requires preferred shift.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const response = await apiRequest<CareerResponse>('/workflow/careers/apply', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          phone,
          email,
          password,
          city,
          position,
          securityQuestionOne,
          securityAnswerOne,
          securityQuestionTwo,
          securityAnswerTwo,
          aadhaarNumber,
          panNumber,
          teamSpecialization,
          teamPreferredShift,
          experience,
          whyHireYou,
        }),
      });

      setReferenceId(response.referenceId);
      setGeneratedRegistrationNumber(response.registrationNumber);
      setFullName('');
      setPhone('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setCity('');
      setSecurityQuestionOne(SECURITY_QUESTIONS[0]);
      setSecurityAnswerOne('');
      setSecurityQuestionTwo(SECURITY_QUESTIONS[1]);
      setSecurityAnswerTwo('');
      setAadhaarNumber('');
      setPanNumber('');
      setTeamSpecialization('');
      setTeamPreferredShift('');
      setExperience('');
      setWhyHireYou('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
            {lockedPosition ? `ZDT Realty ${lockedPosition} Registration` : 'ZDT Realty Careers'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            {lockedPosition ? `${lockedPosition} Registration` : 'Join Our Internal Team'}
          </h1>
          <p className="mt-2 text-sm text-white/85">
            {lockedPosition
              ? 'Submit your application. Every application is reviewed manually by the Main Admin.'
              : 'Apply for structured internal roles. Every application is reviewed manually by the Main Admin.'}
          </p>
        </div>

        {!lockedPosition && !isLoadingAvailability && adminApplicationsClosed && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Admin applications are currently closed
            {adminSeatUsage ? ` (${adminSeatUsage.used}/${adminSeatUsage.max} seats filled).` : '.'}{' '}
            You can still apply for Team Member.
          </p>
        )}

        {!lockedPosition && (
          <div className={`grid gap-4 ${showAdminApplyOption ? 'md:grid-cols-2' : ''}`}>
            {showAdminApplyOption && (
              <button
                type="button"
                onClick={() => setPosition('Admin')}
                className={`rounded-2xl border p-5 text-left transition ${
                  position === 'Admin'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  Admin Apply
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Admin can approve listings, remove fake data, manage team members and update property status.
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPosition('Team Member')}
              className={`rounded-2xl border p-5 text-left transition ${
                position === 'Team Member'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                <Users className="h-4 w-4 text-blue-700" />
                Apply for Team
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Team members assist buyers/sellers/renters, update workflow statuses, and handle assisted listings.
              </p>
            </button>
          </div>
        )}

        {showAdminLockedNotice ? (
          <div className="zdt-panel rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-xl sm:p-6">
            <h2 className="text-xl font-semibold text-amber-900">Admin Applications Closed</h2>
            <p className="mt-2 text-sm text-amber-800">
              Admin seats are currently full
              {adminSeatUsage ? ` (${adminSeatUsage.used}/${adminSeatUsage.max} seats filled).` : '.'}{' '}
              Please apply for the Team role instead.
            </p>
          </div>
        ) : (
          <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">Registration Form</h2>
          <p className="mt-1 text-sm text-slate-600">
            Position applying for: <span className="font-semibold text-slate-900">{position}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Registration number is generated automatically by ZDT Realty after submission.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full Name"
              className="h-11 bg-white"
            />
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone Number"
              className="h-11 bg-white"
            />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="h-11 bg-white"
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create Password"
              className="h-11 bg-white"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm Password"
              className="h-11 bg-white"
            />
            <div className="space-y-2">
              <LgdLocationInput
                value={city}
                onChange={setCity}
                placeholder="City"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="village"
              />
              <LgdLocationAccuracyNote />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Security Question 1
              </p>
              <Select value={securityQuestionOne} onValueChange={setSecurityQuestionOne}>
                <SelectTrigger className="h-11 bg-white text-slate-900">
                  <SelectValue placeholder="Select security question 1" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  {SECURITY_QUESTIONS.map((question) => (
                    <SelectItem key={question} value={question}>
                      {question}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={securityAnswerOne}
              onChange={(event) => setSecurityAnswerOne(event.target.value)}
              placeholder="Security Answer 1"
              className="h-11 bg-white sm:col-span-2"
            />
            <div className="sm:col-span-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Security Question 2
              </p>
              <Select value={securityQuestionTwo} onValueChange={setSecurityQuestionTwo}>
                <SelectTrigger className="h-11 bg-white text-slate-900">
                  <SelectValue placeholder="Select security question 2" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  {SECURITY_QUESTIONS.map((question) => (
                    <SelectItem key={question} value={question}>
                      {question}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={securityAnswerTwo}
              onChange={(event) => setSecurityAnswerTwo(event.target.value)}
              placeholder="Security Answer 2"
              className="h-11 bg-white sm:col-span-2"
            />
            {position === 'Admin' && (
              <>
                <Input
                  value={aadhaarNumber}
                  onChange={(event) =>
                    setAadhaarNumber(event.target.value.replace(/\D/g, '').slice(0, 12))
                  }
                  placeholder="Aadhaar Number (12 digits)"
                  className="h-11 bg-white"
                />
                <Input
                  value={panNumber}
                  onChange={(event) => setPanNumber(event.target.value.toUpperCase())}
                  placeholder="PAN Number"
                  className="h-11 bg-white"
                />
              </>
            )}
            {position === 'Team Member' && (
              <>
                <Input
                  value={teamSpecialization}
                  onChange={(event) => setTeamSpecialization(event.target.value)}
                  placeholder="Team Specialization (e.g. Lead Calling / Listings)"
                  className="h-11 bg-white"
                />
                <Input
                  value={teamPreferredShift}
                  onChange={(event) => setTeamPreferredShift(event.target.value)}
                  placeholder="Preferred Shift (Morning / Evening)"
                  className="h-11 bg-white"
                />
              </>
            )}
            <Input
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
              placeholder="Experience (Optional)"
              className="h-11 bg-white sm:col-span-2"
            />
            <Textarea
              value={whyHireYou}
              onChange={(event) => setWhyHireYou(event.target.value)}
              placeholder="Why should we hire you?"
              className="min-h-28 bg-white sm:col-span-2"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {referenceId && (
            <p className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Registration submitted. Reference ID: {referenceId}. Registration Number:{' '}
              {generatedRegistrationNumber}. Use these with your email and password when logging in after approval.
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={submitApplication}
              disabled={isSubmitting}
              className="bg-brand-primary text-white hover:bg-brand-primary-dark"
            >
              <BriefcaseBusiness className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
          </div>
        )}
      </div>
    </section>
  );
}
