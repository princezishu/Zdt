import { Mail, Phone, MapPin, MessageCircle, Clock, Building2, Send, ExternalLink } from 'lucide-react';

const contactChannels = [
  {
    icon: Mail,
    label: 'Email',
    value: 'zdtrealty@gmail.com',
    href: 'mailto:zdtrealty@gmail.com',
    description: 'For platform support, feedback, and media queries',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  {
    icon: Phone,
    label: 'Phone',
    value: '+91 76768 15237',
    href: 'tel:+917676815237',
    description: 'Mon–Sat, 10:00 AM – 7:00 PM IST',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  {
    icon: MessageCircle,
    label: 'WhatsApp',
    value: 'Chat with us',
    href: 'https://wa.me/917676815237?text=Hi%20ZDT%20Realty%2C%20I%20need%20help%20with',
    description: 'Quick responses for property inquiries',
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
  },
];

const officeDetails = {
  address: 'Bangalore, Karnataka, India',
  hours: 'Monday – Saturday: 10:00 AM – 7:00 PM IST',
  response: 'We typically respond within 24 hours',
};

const inquiryTypes = [
  { title: 'Property Listing', description: 'Want to list your property or manage existing listings', icon: Building2 },
  { title: 'Builder Partnership', description: 'Interested in partnering with ZDT Realty for your projects', icon: Send },
  { title: 'Media & Press', description: 'Press inquiries, interviews, and media collaborations', icon: ExternalLink },
  { title: 'General Support', description: 'Account issues, feedback, or platform assistance', icon: MessageCircle },
];

export default function ContactPage() {
  return (
    <section className="zdt-public-page relative overflow-hidden pb-16 pt-28 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_56%)]" />

      <div className="page-container relative z-10 space-y-8">
        {/* Hero */}
        <div className="zdt-public-hero rounded-3xl p-8 sm:p-10">
          <p className="zdt-public-kicker text-xs font-semibold">Get in Touch</p>
          <h1 className="brand-serif mt-3 text-3xl font-bold leading-tight sm:text-4xl">Contact ZDT Realty</h1>
          <p className="mt-4 max-w-4xl text-base leading-relaxed text-slate-600">
            Have a question about listings, need support, or want to explore partnership opportunities?
            Reach out through any of the channels below — our team is ready to help.
          </p>
        </div>

        {/* Contact Channels */}
        <div className="grid gap-5 md:grid-cols-3">
          {contactChannels.map((channel) => (
            <a
              key={channel.label}
              href={channel.href}
              target={channel.href.startsWith('http') ? '_blank' : undefined}
              rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className={`group rounded-3xl border p-6 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 ${channel.bg}`}
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-xl bg-white p-2.5 shadow-sm ${channel.color}`}>
                  <channel.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{channel.label}</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">{channel.value}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{channel.description}</p>
            </a>
          ))}
        </div>

        {/* Office Info & Inquiry Types */}
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Office Information</h2>
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Location</p>
                  <p className="text-sm text-slate-600">{officeDetails.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Business Hours</p>
                  <p className="text-sm text-slate-600">{officeDetails.hours}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Response Time</p>
                  <p className="text-sm text-slate-600">{officeDetails.response}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">How Can We Help?</h2>
            <div className="mt-5 space-y-3">
              {inquiryTypes.map((item) => (
                <div key={item.title} className="zdt-public-muted-card flex items-start gap-3 rounded-xl p-3">
                  <item.icon className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        {/* Before You Contact Tips */}
        <div className="zdt-public-card rounded-3xl p-7">
          <h2 className="text-lg font-semibold text-slate-900">Before You Contact</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            <li className="zdt-public-muted-card rounded-xl px-4 py-3 text-sm text-slate-600">
              Include your name and role (buyer, tenant, owner, builder, or agent).
            </li>
            <li className="zdt-public-muted-card rounded-xl px-4 py-3 text-sm text-slate-600">
              Share your city and a short summary of your request.
            </li>
            <li className="zdt-public-muted-card rounded-xl px-4 py-3 text-sm text-slate-600">
              For listing issues, include listing reference ID if available.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
