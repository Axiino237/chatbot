import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface KnowledgeContextType {
    isUploaded: boolean;
    loading: boolean;
    checkStatus: () => Promise<void>;
    setStatus: (status: boolean) => Promise<void>;
    isSettingsUnlocked: boolean;
    setSettingsUnlocked: (status: boolean) => void;
}

const KnowledgeContext = createContext<KnowledgeContextType>({
    isUploaded: false,
    loading: true,
    checkStatus: async () => { },
    setStatus: async () => { },
    isSettingsUnlocked: false,
    setSettingsUnlocked: () => { },
});

export const KnowledgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [isUploaded, setIsUploaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSettingsUnlocked, setSettingsUnlocked] = useState(false);

    const checkStatus = async () => {
        if (!user) return;

        setLoading(true);
        const { data, error } = await supabase
            .from('knowledge_status')
            .select('is_uploaded')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
            console.error('Error fetching knowledge status:', error);
        } else if (data) {
            setIsUploaded(data.is_uploaded);
        } else {
            // If no status exists, create one
            await supabase.from('knowledge_status').insert([{ user_id: user.id, is_uploaded: false }]);
            setIsUploaded(false);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (user) {
            checkStatus();
        } else {
            setIsUploaded(false);
            setLoading(false);
        }
    }, [user?.id]);

    const setStatus = async (status: boolean) => {
        if (!user) return;

        // Optimistically update UI first for instant feedback
        setIsUploaded(status);

        const { error } = await supabase
            .from('knowledge_status')
            .upsert({ user_id: user.id, is_uploaded: status });

        if (error) {
            console.error('Error updating knowledge status:', error);
            // Revert on error
            setIsUploaded(!status);
        }
    };

    return (
        <KnowledgeContext.Provider value={{ isUploaded, loading, checkStatus, setStatus, isSettingsUnlocked, setSettingsUnlocked }}>
            {children}
        </KnowledgeContext.Provider>
    );
};

export const useKnowledge = () => useContext(KnowledgeContext);
