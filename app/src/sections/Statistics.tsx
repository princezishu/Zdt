import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Users, MapPin, ThumbsUp } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ------------------ STATS DATA ------------------
const stats = [
  {
    icon: Building2,
    value: 50000,
    suffix: '+',
    label: 'Properties Listed',
  },
  {
    icon: Users,
    value: 10000,
    suffix: '+',
    label: 'Happy Clients',
  },
  {
    icon: MapPin,
    value: 25000,
    suffix: '+',
    label: 'Cities Covered',
  },
  {
    icon: ThumbsUp,
    value: 98,
    suffix: '%',
    label: 'Satisfied Clients',
  },
]

// ------------------ COUNTER COMPONENT ------------------
function AnimatedCounter({ value, suffix, isVisible }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isVisible) return

    const duration = 2000
    const steps = 60
    const increment = value / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment

      if (current >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value, isVisible])

  const formatNumber = (num) => {
    return num >= 1000 ? num.toLocaleString() : num.toString()
  }

  return (
    <span className="tabular-nums">
      {formatNumber(count)}
      {suffix}
    </span>
  )
}

// ------------------ MAIN COMPONENT ------------------
export default function Statistics() {
  const sectionRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  // Stable floating particles
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 10 + Math.random() * 10,
      delay: Math.random() * 5,
    }))
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top 70%',
        onEnter: () => setIsVisible(true),
      })

      const cards = sectionRef.current?.querySelectorAll('.stat-card')

      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.15,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top 75%',
              toggleActions: 'play none none none',
            },
          }
        )
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-brand-primary overflow-hidden section-pad"
    >
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark" />
        <div className="absolute inset-0 scanlines pointer-events-none" />

        {/* Floating particles */}
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-white/10 rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              animation: `float ${p.duration}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative page-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="stat-card group relative bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center hover:bg-white/20 transition-all duration-300 neon-card"
            >
              {/* Icon */}
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                <stat.icon className="w-7 h-7 text-white" />
              </div>

              {/* Value */}
              <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
                <AnimatedCounter
                  value={stat.value}
                  suffix={stat.suffix}
                  isVisible={isVisible}
                />
              </div>

              {/* Label */}
              <p className="text-white/80 text-sm lg:text-base">
                {stat.label}
              </p>

              {/* Glow Effect */}
              <div className="absolute inset-0 rounded-xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
