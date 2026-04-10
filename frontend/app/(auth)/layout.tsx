export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel — original dark navy background, white text */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col px-12 py-14 relative overflow-hidden"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.04,
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow blobs */}
        <div
          className="absolute rounded-full blur-3xl"
          style={{ bottom: '-8rem', left: '-8rem', width: '20rem', height: '20rem', backgroundColor: 'rgba(79,70,229,0.2)' }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{ top: '-5rem', right: '-5rem', width: '15rem', height: '15rem', backgroundColor: 'rgba(67,56,202,0.3)' }}
        />

        <div className="relative z-10 flex flex-col h-full">
          <span className="text-2xl font-semibold text-white tracking-tight">Credex</span>

          <div className="mt-auto">
            <p className="text-3xl xl:text-4xl font-semibold text-white leading-snug">
              Trade finance,<br />built for India.
            </p>
            <p className="mt-4 text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              One platform for procurement, payments, and credit — designed for Indian SMEs who mean business.
            </p>

            <ul className="mt-10 space-y-3">
              {[
                'AI-powered cash flow optimizer',
                'Embedded trade financing',
                'Real-time credit scoring',
                'End-to-end procurement',
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
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
            <span className="text-2xl font-semibold text-indigo-600">Credex</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}