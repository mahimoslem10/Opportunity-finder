import { useState, type FormEvent } from 'react';
import { Loader2, Telescope } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { Button, Card, Field, Message, inputClass } from '@/components/ui';

export function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-navy-600 text-on-brand flex items-center justify-center shadow-md mb-4">
            <Telescope className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunity Finder</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to open your private workspace.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full py-2.5">
              <span className="flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Signing in...' : 'Sign in'}
              </span>
            </Button>
            {error && <Message type="error">{error}</Message>}
          </form>
        </Card>
      </div>
    </div>
  );
}
