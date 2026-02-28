import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { useKnowledge } from '../context/KnowledgeContext';
import { X, Trash2, FileText, Lock, Loader2, AlertTriangle, FileUp, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface KnowledgeDoc {
    file_name: string;
    created_at: string;
}

export const KnowledgeSettings = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const { setStatus, isSettingsUnlocked, setSettingsUnlocked } = useKnowledge();
    const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);
    const [reauthError, setReauthError] = useState<string | null>(null);

    // Upload state
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const fetchDocs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('documents')
            .select('file_name, created_at')
            .order('created_at', { ascending: false });

        if (!error && data) {
            // Deduplicate by file_name to show unique sources
            const seen = new Set<string>();
            const unique = data.filter(d => {
                if (seen.has(d.file_name)) return false;
                seen.add(d.file_name);
                return true;
            });
            setDocuments(unique);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen && isSettingsUnlocked) {
            fetchDocs();
        }
    }, [isOpen, isSettingsUnlocked]);

    const handleReauth = async (e: React.FormEvent) => {
        e.preventDefault();
        setReauthLoading(true);
        setReauthError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        const { error } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: password,
        });

        if (error) {
            setReauthError('Invalid password. Please try again.');
            setReauthLoading(false);
        } else {
            setSettingsUnlocked(true);
            fetchDocs();
        }
    };

    const handleDelete = async (fileName: string) => {
        setDeletingId(fileName);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('documents')
                .delete()
                .eq('user_id', user.id)
                .eq('file_name', fileName);

            if (error) throw error;

            setDocuments(prev => prev.filter(d => d.file_name !== fileName));

            if (documents.length <= 1) {
                await setStatus(false);
            }
        } catch (err) {
            console.error('Delete error:', err);
        } finally {
            setDeletingId(null);
        }
    };


    const handleManualAdd = async () => {
        const name = prompt("Knowledge source name:");
        if (!name) return;

        const content = prompt("Paste the knowledge content here:");
        if (!content) return;

        setUploading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const { data: result, error: invokeError } = await supabase.functions.invoke('process-content', {
                body: { content, fileName: name },
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            if (invokeError || (result && result.success === false)) {
                throw new Error(invokeError?.message || result?.error || "Add failed");
            }

            fetchDocs();
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setUploading(false);
        }
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
            setUploadError(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setUploadError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // 1. Extract text from PDF directly in the browser
            console.log('Extracting text locally in settings...');
            const { extractTextFromPDF } = await import('../utils/pdf');
            const extractedText = await extractTextFromPDF(file);

            if (!extractedText || extractedText.length < 10) {
                throw new Error("Could not extract enough text from the PDF. It might be an image-based PDF or empty.");
            }

            // 2. Call the process-content Edge Function
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No active session found");

            const { data: result, error: invokeError } = await supabase.functions.invoke('process-content', {
                body: {
                    content: extractedText,
                    fileName: file.name
                },
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            });

            if (invokeError) {
                console.error('Invoke Error:', invokeError);
                throw new Error("Failed to reach processing server.");
            }

            if (result && result.success === false) {
                console.error('Processing Error:', result.error);
                throw new Error(result.error || "Failed to process content.");
            }

            // 3. Success -> reset state & refetch docs
            setUploadSuccess(true);
            setFile(null);
            fetchDocs();

            setTimeout(() => {
                setUploadSuccess(false);
            }, 3000);

        } catch (err: any) {
            console.error('Settings upload flow error:', err);
            setUploadError(err.message || 'Failed to process document');
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass-card modal-content"
                style={{ maxHeight: '90vh', overflowY: 'auto' }} // Added scrolling for taller content
            >
                <div className="modal-header">
                    <h3>Knowledge Settings</h3>
                    <button className="icon-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {(!isSettingsUnlocked) ? (
                    <div className="reauth-area">
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <Lock size={32} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
                            <p>Security Check Required</p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Please re-enter your password to manage your knowledge base.
                            </p>
                        </div>
                        <form onSubmit={handleReauth}>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            {reauthError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>{reauthError}</p>}
                            <button className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={reauthLoading}>
                                {reauthLoading ? <Loader2 className="animate-spin" size={20} /> : 'Unlock Settings'}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="settings-content">
                        <div className="docs-list">
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                Manage your uploaded knowledge sources.
                            </p>

                            {/* New Upload Area inside Settings */}
                            <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--glass-bg)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                                <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>Upload Additional Knowledge</h4>
                                <div
                                    {...getRootProps()}
                                    style={{
                                        border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--glass-border)'}`,
                                        borderRadius: '0.5rem',
                                        padding: '1.5rem 1rem',
                                        background: isDragActive ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        position: 'relative',
                                        textAlign: 'center',
                                        marginBottom: file ? '1rem' : '0'
                                    }}
                                >
                                    <input {...getInputProps()} />
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileUp size={24} className={isDragActive ? 'text-primary' : 'text-muted'} />
                                        {file ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem' }}>
                                                <FileText size={14} />
                                                <span className="truncate" style={{ maxWidth: '150px' }}>{file.name}</span>
                                                <X
                                                    size={14}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFile(null);
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{isDragActive ? 'Drop it here' : 'Drag & drop a new PDF'}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {uploadError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>{uploadError}</p>}
                                {uploadSuccess && (
                                    <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <CheckCircle2 size={14} /> Upload successful!
                                    </p>
                                )}

                                {file && (
                                    <button
                                        className="btn-primary"
                                        disabled={uploading}
                                        style={{ width: '100%', padding: '0.75rem' }}
                                        onClick={handleUpload}
                                    >
                                        {uploading ? <Loader2 className="animate-spin" size={18} /> : null}
                                        {uploading ? 'Processing Knowledge...' : 'Upload & Process'}
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 500 }}>Your Knowledge Sources</h4>
                                <button
                                    className="btn-primary"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                    onClick={handleManualAdd}
                                >
                                    + Add Manually
                                </button>
                            </div>

                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader2 className="animate-spin" size={24} />
                                </div>
                            ) : documents.length === 0 ? (
                                <div className="empty-state">
                                    <FileText size={32} />
                                    <p>No documents found.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {documents.map((doc) => (
                                        <div key={doc.file_name} className="doc-item">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                <FileText size={18} />
                                                <div className="truncate">
                                                    <p style={{ fontSize: '0.875rem', fontWeight: 500 }} className="truncate">{doc.file_name}</p>
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        Added {new Date(doc.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                className="delete-btn"
                                                onClick={() => handleDelete(doc.file_name)}
                                                disabled={deletingId === doc.file_name}
                                            >
                                                {deletingId === doc.file_name ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="warning-box">
                            <AlertTriangle size={18} />
                            <p>Deleting a document will remove all its associated knowledge and vectors. This cannot be undone.</p>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};
