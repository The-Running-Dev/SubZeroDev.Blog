import { useState } from 'react';
import type { FormEvent } from 'react';

/**
 * `/login` is a route within this same SPA, not a separate static HTML
 * entry (unlike the vanilla UI it replaces) -- the JS bundle itself carries
 * no secrets, and every protected action still goes through an
 * authenticated /api call, so there's no security reason to keep it split
 * out. Simplifies the static server (src/serve/static.ts) to one SPA
 * fallback rule instead of a special-cased second entry point.
 */
export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, remember })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Sign in failed.');
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Sign in failed.');
    }
  }

  return (
    <main className="login">
      <h1>blog-mcp</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="field field-checkbox">
          <input
            type="checkbox"
            id="remember"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <label htmlFor="remember">Remember me for 30 days</label>
        </div>
        <button type="submit" className="primary">
          Sign in
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
