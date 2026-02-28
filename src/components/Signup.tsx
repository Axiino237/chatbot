import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Mail, Lock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export const Signup = ({ onToggle }: { onToggle: () => void }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            alert('Signup successful! Please check your email for verification.');
            onToggle();
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card auth-card"
        >
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Create Account</h2>
                <p style={{ color: 'var(--text-muted)' }}>Join the future of knowledge management</p>
            </div>

            <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={16} /> Email Address
                    </label>
                    <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        className="input-field"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={16} /> Password
                    </label>
                    <input
                        type="password"
                        name="password"
                        autoComplete="new-password"
                        className="input-field"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>

                {error && (
                    <div style={{ color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                    {loading ? 'Creating account...' : 'Create Account'}
                </button>
            </form>

            <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Already have an account?{' '}
                <span
                    onClick={onToggle}
                    style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                    Sign in
                </span>
            </div>
        </motion.div>
    );
};
