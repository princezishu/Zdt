# Technical Specification - ZDT Realty Property Portal

## Component Inventory

### shadcn/ui Components (Built-in)
| Component | Purpose | Customization |
|-----------|---------|---------------|
| Button | CTAs, navigation, actions | Custom colors, sizes, hover effects |
| Card | Property cards, service cards | 3D transform on hover |
| Input | Search box, newsletter | Focus animations |
| Badge | Feature pills, labels | Floating animation |
| Dialog | Mobile menu, property details | Slide animations |
| Carousel | Property showcase | 3D perspective carousel |
| Avatar | Testimonial profiles | Scale on hover |
| Separator | Visual dividers | Animated width expand |
| Sheet | Mobile navigation | Slide from right |
| Tabs | AI features showcase | Morphing connector |
| Accordion | FAQ section | Smooth height animation |

### Third-Party Registry Components
| Component | Registry | Purpose |
|-----------|----------|---------|
| @magicui/number-ticker | magicui | Animated statistics counter |
| @magicui/animated-beam | magicui | Connector line animation |
| @aceternity/3d-card | aceternity | 3D tilt cards |
| @aceternity/timeline | aceternity | Process timeline |

### Custom Components
| Component | Purpose | Complexity |
|-----------|---------|------------|
| FloatingPill | Feature pills with float animation | Medium |
| PropertyCard3D | 3D perspective property card | High |
| AnimatedCounter | Slot-machine number animation | Medium |
| TestimonialStack | 3D card stack rotation | High |
| GradientMesh | WebGL hero background | High |
| MorphingConnector | SVG path morph between features | Medium |
| ParallaxImage | Image with parallax scroll | Low |
| MagneticButton | Button with magnetic hover | Medium |

## Animation Implementation Table

| Animation | Library | Implementation Approach | Complexity |
|-----------|---------|------------------------|------------|
| Header scroll blur | CSS | backdrop-filter on scroll class | Low |
| Nav link stagger entrance | GSAP | Timeline with stagger | Medium |
| Hero headline 3D flip | GSAP | SplitText + rotateX | High |
| Hero gradient mesh | Three.js | WebGL shader | High |
| Feature pills floating | CSS | @keyframes sine wave | Low |
| Search box focus glow | CSS | Box-shadow transition | Low |
| Category cards 3D flip | GSAP | ScrollTrigger + rotateY | Medium |
| Category card 3D tilt | CSS | perspective + :hover transform | Medium |
| Property carousel 3D | GSAP | Carousel with translateZ | High |
| AI feature connector | GSAP | MorphSVG plugin | Medium |
| Statistics counter | Custom | Number ticker component | Medium |
| Background particles | CSS | @keyframes floating dots | Low |
| Services masonry reveal | GSAP | ScrollTrigger stagger | Medium |
| Testimonial 3D stack | GSAP | Card rotation with depth | High |
| CTA floating cards | CSS | @keyframes circular path | Medium |
| Footer stagger reveal | GSAP | Intersection Observer trigger | Medium |
| Social icon pop | CSS | :hover scale with elastic | Low |

## Animation Library Choices

### Primary: GSAP + ScrollTrigger
**Rationale:**
- Industry-standard for complex scroll animations
- Excellent performance with GPU acceleration
- Precise timing control
- ScrollTrigger for pin and scrub effects

**Usage:**
- Section entrance animations
- Scroll-linked parallax
- 3D transforms
- Complex timelines

### Secondary: CSS Animations + Transitions
**Rationale:**
- Best performance for simple effects
- No JavaScript overhead
- Hardware accelerated

**Usage:**
- Hover states
- Continuous floating animations
- Simple fades and slides
- Micro-interactions

### Tertiary: Three.js (Hero Only)
**Rationale:**
- WebGL for complex visual effects
- Shader support for gradient mesh

**Usage:**
- Hero background gradient mesh
- Performance-critical: reduce on mobile

## Project File Structure

```
app/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── carousel.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── accordion.tsx
│   │   ├── animations/            # Animation components
│   │   │   ├── FloatingPill.tsx
│   │   │   ├── AnimatedCounter.tsx
│   │   │   ├── ParallaxImage.tsx
│   │   │   ├── MagneticButton.tsx
│   │   │   └── GradientMesh.tsx
│   │   └── shared/                # Shared components
│   │       ├── PropertyCard3D.tsx
│   │       ├── TestimonialCard.tsx
│   │       └── ServiceCard.tsx
│   ├── sections/                  # Page sections
│   │   ├── Header.tsx
│   │   ├── Hero.tsx
│   │   ├── Categories.tsx
│   │   ├── FeaturedProperties.tsx
│   │   ├── AIFeatures.tsx
│   │   ├── Statistics.tsx
│   │   ├── Services.tsx
│   │   ├── Testimonials.tsx
│   │   ├── CTA.tsx
│   │   └── Footer.tsx
│   ├── hooks/                     # Custom hooks
│   │   ├── useScrollPosition.ts
│   │   ├── useInView.ts
│   │   └── useReducedMotion.ts
│   ├── lib/                       # Utilities
│   │   ├── utils.ts
│   │   └── animations.ts
│   ├── styles/
│   │   └── animations.css
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── images/
│       ├── hero-bg.jpg
│       ├── properties/
│       │   ├── property-1.jpg
│       │   ├── property-2.jpg
│       │   ├── property-3.jpg
│       │   ├── property-4.jpg
│       │   └── property-5.jpg
│       ├── avatars/
│       │   ├── avatar-1.jpg
│       │   ├── avatar-2.jpg
│       │   ├── avatar-3.jpg
│       │   └── avatar-4.jpg
│       └── services/
│           ├── location.jpg
│           ├── materials.jpg
│           ├── analytics.jpg
│           ├── news.jpg
│           ├── apartments.jpg
│           └── subscription.jpg
├── index.html
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## Dependencies

### Core
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "typescript": "^5.0.0"
}
```

### Animation
```json
{
  "gsap": "^3.12.0",
  "@gsap/react": "^2.0.0",
  "three": "^0.160.0",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.92.0"
}
```

### UI
```json
{
  "@radix-ui/react-*": "latest",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0",
  "tailwind-merge": "^2.0.0",
  "lucide-react": "^0.300.0",
  "embla-carousel-react": "^8.0.0"
}
```

### Utilities
```json
{
  "framer-motion": "^10.0.0"
}
```

## Implementation Priority

### Phase 1: Foundation
1. Initialize project with shadcn
2. Install GSAP and animation libraries
3. Set up global styles and CSS variables
4. Create animation utility hooks

### Phase 2: Core Sections
1. Header with scroll effects
2. Hero with 3D text and search
3. Categories with 3D cards
4. Footer with stagger reveals

### Phase 3: Advanced Sections
1. Featured Properties 3D carousel
2. AI Features with connector
3. Statistics counter
4. Services grid

### Phase 4: Polish
1. Testimonials 3D stack
2. CTA floating cards
3. Performance optimization
4. Mobile responsiveness

## Performance Budget

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s
- Cumulative Layout Shift: < 0.1
- Total JavaScript: < 500KB gzipped

## Responsive Strategy

### Desktop (> 991px)
- Full animation suite
- WebGL hero background
- 3D transforms
- All parallax effects

### Tablet (768px - 991px)
- Reduced 3D depth
- Simplified particles
- Touch-optimized carousel
- No WebGL

### Mobile (< 768px)
- Essential animations only
- Simple fades and slides
- Swipe gestures
- Reduced motion by default

### Reduced Motion
- Respect prefers-reduced-motion
- Instant transitions
- No continuous animations
- Static backgrounds
