import { useEffect, useMemo, useState } from 'react';
import { applySeo } from '@/lib/seo';
import {
  Calculator,
  IndianRupee,
  TrendingDown,
  Calendar,
  PiggyBank,
  Building2,
  Percent,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const POPULAR_BANKS = [
  { name: 'SBI', rate: 8.5 },
  { name: 'HDFC', rate: 8.7 },
  { name: 'ICICI', rate: 8.75 },
  { name: 'Axis', rate: 8.75 },
  { name: 'Bank of Baroda', rate: 8.4 },
  { name: 'PNB', rate: 8.5 },
  { name: 'Kotak Mahindra', rate: 8.7 },
  { name: 'LIC Housing', rate: 8.5 },
];

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function calculateEMI(principal: number, annualRate: number, tenureMonths: number) {
  if (principal <= 0 || tenureMonths <= 0) return { emi: 0, totalInterest: 0, totalPayment: 0 };
  if (annualRate <= 0) return { emi: Math.round(principal / tenureMonths), totalInterest: 0, totalPayment: principal };
  const monthlyRate = annualRate / 12 / 100;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  const totalPayment = emi * tenureMonths;
  return {
    emi: Math.round(emi),
    totalInterest: Math.round(totalPayment - principal),
    totalPayment: Math.round(totalPayment),
  };
}

function generateAmortization(principal: number, annualRate: number, tenureMonths: number) {
  const schedule: Array<{ year: number; principalPaid: number; interestPaid: number; balance: number }> = [];
  if (principal <= 0 || tenureMonths <= 0 || annualRate <= 0) return schedule;
  const monthlyRate = annualRate / 12 / 100;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  let balance = principal;
  let yearPrincipal = 0;
  let yearInterest = 0;
  for (let month = 1; month <= tenureMonths; month++) {
    const interestPart = balance * monthlyRate;
    const principalPart = emi - interestPart;
    balance -= principalPart;
    yearPrincipal += principalPart;
    yearInterest += interestPart;
    if (month % 12 === 0 || month === tenureMonths) {
      schedule.push({
        year: Math.ceil(month / 12),
        principalPaid: Math.round(yearPrincipal),
        interestPaid: Math.round(yearInterest),
        balance: Math.max(0, Math.round(balance)),
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }
  return schedule;
}

export default function EMICalculatorPage() {
  const [loanAmount, setLoanAmount] = useState(5000000);
  const [interestRate, setInterestRate] = useState(8.5);
  const [tenureYears, setTenureYears] = useState(20);
  const [showAmortization, setShowAmortization] = useState(false);

  useEffect(() => {
    applySeo({
      title: 'Home Loan EMI Calculator | ZDT Realty',
      description:
        'Calculate your monthly EMI for home loans. Compare interest rates across banks, view amortization schedules, and plan your property purchase.',
      canonicalPath: '/emi-calculator',
    });
  }, []);

  const tenureMonths = tenureYears * 12;
  const result = useMemo(
    () => calculateEMI(loanAmount, interestRate, tenureMonths),
    [loanAmount, interestRate, tenureMonths]
  );
  const schedule = useMemo(
    () => (showAmortization ? generateAmortization(loanAmount, interestRate, tenureMonths) : []),
    [showAmortization, loanAmount, interestRate, tenureMonths]
  );

  const principalPercent = result.totalPayment > 0 ? ((loanAmount / result.totalPayment) * 100).toFixed(1) : '0';
  const interestPercent = result.totalPayment > 0 ? ((result.totalInterest / result.totalPayment) * 100).toFixed(1) : '0';

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        {/* Hero */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 px-6 py-8 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                  <Calculator className="h-3.5 w-3.5" /> Financial Tool
                </div>
                <h1 className="mt-4 text-3xl font-semibold">Home Loan EMI Calculator</h1>
                <p className="mt-2 text-sm text-emerald-100">
                  Plan your property purchase. Calculate monthly EMI, compare bank rates, and view year-by-year amortization.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 backdrop-blur">
                <IndianRupee className="h-8 w-8 text-emerald-200" />
                <div>
                  <p className="text-2xl font-bold">{formatINR(result.emi)}</p>
                  <p className="text-xs text-emerald-200">Monthly EMI</p>
                </div>
              </div>
            </div>
          </div>

          {/* Calculator inputs */}
          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <div className="space-y-6">
              {/* Loan Amount */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Loan Amount</label>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <span className="text-xs text-slate-500">₹</span>
                    <Input
                      type="number"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(Math.max(100000, Number(e.target.value) || 0))}
                      className="h-7 w-28 border-0 bg-transparent p-0 text-right text-sm font-semibold shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
                <Slider
                  min={100000}
                  max={100000000}
                  step={100000}
                  value={[loanAmount]}
                  onValueChange={([v]) => setLoanAmount(v)}
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>₹1 Lakh</span>
                  <span>₹10 Crore</span>
                </div>
              </div>

              {/* Interest Rate */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Interest Rate (p.a.)</label>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <Input
                      type="number"
                      step={0.1}
                      value={interestRate}
                      onChange={(e) => setInterestRate(Math.max(1, Math.min(20, Number(e.target.value) || 0)))}
                      className="h-7 w-16 border-0 bg-transparent p-0 text-right text-sm font-semibold shadow-none focus-visible:ring-0"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={0.1}
                  value={[interestRate]}
                  onValueChange={([v]) => setInterestRate(v)}
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>1%</span>
                  <span>20%</span>
                </div>
              </div>

              {/* Tenure */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Loan Tenure</label>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <Input
                      type="number"
                      value={tenureYears}
                      onChange={(e) => setTenureYears(Math.max(1, Math.min(30, Number(e.target.value) || 0)))}
                      className="h-7 w-12 border-0 bg-transparent p-0 text-right text-sm font-semibold shadow-none focus-visible:ring-0"
                    />
                    <span className="text-xs text-slate-500">Years</span>
                  </div>
                </div>
                <Slider
                  min={1}
                  max={30}
                  step={1}
                  value={[tenureYears]}
                  onValueChange={([v]) => setTenureYears(v)}
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>1 Year</span>
                  <span>30 Years</span>
                </div>
              </div>
            </div>

            {/* Results Panel */}
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    <IndianRupee className="h-3.5 w-3.5" /> Monthly EMI
                  </div>
                  <p className="mt-2 text-2xl font-bold text-emerald-900">{formatINR(result.emi)}</p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                    <PiggyBank className="h-3.5 w-3.5" /> Principal
                  </div>
                  <p className="mt-2 text-2xl font-bold text-blue-900">{formatINR(loanAmount)}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                    <TrendingDown className="h-3.5 w-3.5" /> Total Interest
                  </div>
                  <p className="mt-2 text-2xl font-bold text-amber-900">{formatINR(result.totalInterest)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    <Calendar className="h-3.5 w-3.5" /> Total Payment
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{formatINR(result.totalPayment)}</p>
                </div>
              </div>

              {/* Visual Breakdown */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Breakdown</p>
                <div className="mt-3 flex h-6 overflow-hidden rounded-full">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${principalPercent}%` }}
                  />
                  <div
                    className="bg-amber-400 transition-all duration-500"
                    style={{ width: `${interestPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Principal ({principalPercent}%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                    Interest ({interestPercent}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Rate Comparison */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-700" />
            <h2 className="text-xl font-semibold text-slate-900">Compare Bank Rates</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Click any bank to auto-fill the interest rate above.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR_BANKS.map((bank) => {
              const bankResult = calculateEMI(loanAmount, bank.rate, tenureMonths);
              const isSelected = Math.abs(interestRate - bank.rate) < 0.01;
              return (
                <button
                  key={bank.name}
                  type="button"
                  onClick={() => setInterestRate(bank.rate)}
                  className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{bank.name}</p>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      <Percent className="h-3 w-3" /> {bank.rate}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-900">{formatINR(bankResult.emi)}<span className="text-xs font-normal text-slate-500">/mo</span></p>
                  <p className="text-xs text-slate-500">Interest: {formatINR(bankResult.totalInterest)}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Amortization Schedule */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Year-by-Year Amortization</h2>
            <Button
              variant="outline"
              onClick={() => setShowAmortization(!showAmortization)}
            >
              {showAmortization ? 'Hide Schedule' : 'Show Schedule'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          {showAmortization && schedule.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-3 py-2">Year</th>
                    <th className="px-3 py-2 text-right">Principal Paid</th>
                    <th className="px-3 py-2 text-right">Interest Paid</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.year} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">Year {row.year}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{formatINR(row.principalPaid)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700">{formatINR(row.interestPaid)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{formatINR(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-900">Home Loan Tips</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { title: 'Check Your CIBIL Score', tip: 'A score above 750 gets you the best rates. Check before applying.' },
              { title: 'Compare Across Banks', tip: 'Even 0.25% difference can save ₹2-3 Lakhs over 20 years.' },
              { title: 'Prepay When Possible', tip: 'Extra payments in early years drastically reduce total interest.' },
              { title: 'Factor in All Costs', tip: 'Include registration, stamp duty, GST, and maintenance in your budget.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs text-slate-600">{item.tip}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          EMI calculations are indicative. Actual EMI may vary based on processing fees, insurance, and bank-specific terms. Consult your bank for exact figures.
        </p>
      </div>
    </section>
  );
}
