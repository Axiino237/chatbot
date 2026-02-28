import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useKnowledge } from '../context/KnowledgeContext';
import { FileUp, FileText, X, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export const KnowledgeUpload = () => {
    const { user } = useAuth();
    const { setStatus, isUploaded } = useKnowledge();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // If already uploaded but somehow on this screen, allow skip
    const handleSkip = async () => {
        await setStatus(true);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
            setError(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    const handleUpload = async () => {
        if (!file || !user) return;

        setUploading(true);
        setError(null);

        try {
            // 1. Extract text from PDF directly in the browser
            console.log('Extracting text locally...');
            const { extractTextFromPDF } = await import('../utils/pdf');
            const extractedText = await extractTextFromPDF(file);

            if (!extractedText || extractedText.length < 10) {
                throw new Error("Could not extract enough text from the PDF. It might be an image-based PDF or empty.");
            }

            console.log('Text extracted, length:', extractedText.length);

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
                throw new Error(`Server error: ${invokeError.message || JSON.stringify(invokeError)}`);
            }

            if (result && result.success === false) {
                console.error('Processing Error:', result.error);
                throw new Error(result.error || "Failed to process content.");
            }

            // 3. Update Status
            setSuccess(true);
            setTimeout(async () => {
                await setStatus(true);
            }, 2000);

        } catch (err: any) {
            console.error('Upload flow error:', err);
            setError(err.message || 'Failed to process document');
            setUploading(false);
        }
    };

    return (
        <div className="auth-container" style={{ padding: '1rem' }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card"
                style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}
            >
                <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '1rem', position: 'relative' }}>
                    {isUploaded && (
                        <button
                            onClick={handleSkip}
                            style={{
                                position: 'absolute',
                                left: '-1rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.875rem'
                            }}
                            title="Back to Chat"
                        >
                            <ArrowLeft size={16} />
                            <span>Back</span>
                        </button>
                    )}
                    Upload Knowledge
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                    To get started, please upload a PDF document that our AI will use as its knowledge base.
                </p>

                {!success ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div
                            {...getRootProps()}
                            style={{
                                border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--glass-border)'}`,
                                borderRadius: '1rem',
                                padding: '3rem 1rem',
                                background: isDragActive ? 'rgba(99, 102, 241, 0.05)' : 'var(--glass-bg)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                position: 'relative'
                            }}
                        >
                            <input {...getInputProps()} />
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <FileUp size={48} className={isDragActive ? 'text-primary' : 'text-muted'} />
                                {file ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '2rem' }}>
                                        <FileText size={16} />
                                        <span style={{ fontWeight: 500 }}>{file.name}</span>
                                        <X
                                            size={16}
                                            style={{ cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFile(null);
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <p style={{ fontWeight: 600 }}>{isDragActive ? 'Drop it here' : 'Drag & drop your PDF'}</p>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>or click to browse files</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}

                        <button
                            className="btn-primary"
                            disabled={!file || uploading}
                            style={{ padding: '1rem' }}
                            onClick={handleUpload}
                        >
                            {uploading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                            {uploading ? 'Processing Knowledge...' : 'Continue to Chat'}
                        </button>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ padding: '2rem 0' }}
                    >
                        <CheckCircle2 size={64} style={{ color: '#10b981', marginBottom: '1rem' }} />
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Upload Successful!</h3>
                        <p style={{ color: 'var(--text-muted)' }}>We're processing your document. Redirecting you to chat...</p>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
};
