export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col bg-navy px-12 py-14 relative overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow */}
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-800/30 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col h-full">
          <span className="font-display text-2xl text-white tracking-tight">Credex</span>

          <div className="mt-auto">
            <p className="font-display text-3xl xl:text-4xl text-white leading-snug">
              Trade finance,<br />built for India.
            </p>
            <p className="mt-4 text-sm text-white/50 leading-relaxed max-w-xs">
              One platform for procurement, payments, and credit — designed for Indian SMEs who mean business.
            </p>

            {/* Feature list */}
            <ul className="mt-10 space-y-3">
              {[
                'AI-powered cash flow optimizer',
                'Embedded trade financing',
                'Real-time credit scoring',
                'End-to-end procurement',
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-white/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <span className="font-display text-2xl text-navy">Credex</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}