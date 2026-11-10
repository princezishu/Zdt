import { Construction } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
  description?: string;
  onBack?: () => void;
}

export default function ComingSoonPage({ title, description, onBack }: ComingSoonPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary">
            <Construction className="w-10 h-10" />
          </span>
        </div>
        <h1 className="text-3xl font-bold mb-3">{title}</h1>
        <p className="text-muted-foreground mb-6">
          {description ?? 'This feature is under development and will be available soon. Stay tuned!'}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            ← Go Back
          </button>
        )}
      </div>
    </div>
  );
}
