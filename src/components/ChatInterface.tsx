import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Send, Settings, LogOut, Bot, User as UserIcon, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KnowledgeSettings } from './KnowledgeSettings';

// Renders simple markdown: **bold**, *italic*, newlines → <br>
const renderMarkdown = (text: string) => {
    const html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br />');
    return { __html: html };
};

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export const ChatInterface = () => {
    const { signOut } = useAuth();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: "Hello! I'm your private AI assistant. I've analyzed your documents and I'm ready to answer any questions based strictly on that information.",
            timestamp: new Date(),
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('Vercel environment variables missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel settings.');
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active session. Please sign in again.');

            const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': supabaseAnonKey
                },
                body: JSON.stringify({ query: userMessage.content })
            });

            const data = await response.json();

            if (!response.ok) {
                // Return the error from the Edge Function if possible
                throw new Error(data.error || `Edge Function error (${response.status})`);
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.answer || "I'm sorry, I couldn't process that request.",
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: any) {
            console.error('Chat error:', err);
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `⚠️ Error: ${err.message}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="chat-layout">
            {/* Header */}
            <header className="chat-header glass-card" style={{ borderRadius: '0 0 1rem 1rem', padding: '1rem 2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="bot-avatar">
                        <Bot size={24} color="white" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.125rem' }}>Knowledge Assistant</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#10b981' }}>
                            <Sparkles size={12} /> Online & Ready
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)}>
                        <Settings size={20} />
                    </button>
                    <button className="icon-btn" onClick={() => signOut()} title="Sign Out">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Messages */}
            <main className="messages-container">
                <div className="messages-list">
                    <AnimatePresence>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`message-wrapper ${msg.role}`}
                            >
                                <div className="message-avatar">
                                    {msg.role === 'assistant' ? <Bot size={16} /> : <UserIcon size={16} />}
                                </div>
                                <div className={`message-bubble ${msg.role}`}>
                                    {msg.role === 'assistant' ? (
                                        <span dangerouslySetInnerHTML={renderMarkdown(msg.content)} />
                                    ) : (
                                        msg.content
                                    )}
                                    <div className="message-time">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {loading && (
                        <div className="message-wrapper assistant">
                            <div className="message-avatar">
                                <Bot size={16} />
                            </div>
                            <div className="message-bubble assistant loading">
                                <Loader2 className="animate-spin" size={20} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Input */}
            <footer className="chat-input-area">
                <form onSubmit={handleSend} className="input-container glass-card">
                    <input
                        type="text"
                        className="chat-input"
                        placeholder="Ask anything about your documents..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" className="send-btn" disabled={!input.trim() || loading}>
                        <Send size={20} />
                    </button>
                </form>
                <p className="disclaimer">
                    AI can make mistakes. Verify important information.
                </p>
            </footer>

            <KnowledgeSettings
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </div>
    );
};
