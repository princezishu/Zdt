interface TrustScoreDialProps {
  score: number;
  label?: string;
}

export default function TrustScoreDial({
  score,
  label = 'Trust score',
}: TrustScoreDialProps) {
  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)));
  const degree = Math.round((normalizedScore / 100) * 360);

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/70 bg-white shadow-[0_20px_40px_-30px_rgba(15,23,42,0.55)]"
        style={{
          backgroundImage: `conic-gradient(from 220deg, #0f172a 0deg, #2563eb 120deg, #10b981 ${degree}deg, rgba(226,232,240,0.95) ${degree}deg 360deg)`,
        }}
      >
        <div className="flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full bg-white text-slate-900">
          <span className="text-[26px] font-bold leading-none">{normalizedScore}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            /100
          </span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-2 max-w-[14rem] text-sm leading-6 text-slate-600">
          Built from verification approvals, trust signals, unresolved flags, and supply quality.
        </p>
      </div>
    </div>
  );
}
