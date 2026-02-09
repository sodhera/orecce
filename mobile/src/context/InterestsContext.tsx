import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@user_interests_v2';

// Default categories if nothing is saved
const DEFAULT_INTERESTS = [
    'All',
    'Venture Capital',
    'UI',
    'Frontend',
    'AI Agents',
    'Image Processing',
    'AI Models',
    'Design Systems',
    'React Native',
    'Performance',
];

interface InterestsContextType {
    interests: string[];
    addInterest: (interest: string) => Promise<void>;
    removeInterest: (interest: string) => Promise<void>;
    resetInterests: () => Promise<void>;
    isLoading: boolean;
}

const InterestsContext = createContext<InterestsContextType | undefined>(undefined);

export const InterestsProvider = ({ children }: { children: ReactNode }) => {
    const [interests, setInterests] = useState<string[]>(DEFAULT_INTERESTS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadInterests();
    }, []);

    const loadInterests = async () => {
        try {
            const savedInterests = await AsyncStorage.getItem(STORAGE_KEY);
            if (savedInterests) {
                setInterests(JSON.parse(savedInterests));
            }
        } catch (error) {
            console.error('Failed to load interests:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const saveInterests = async (newInterests: string[]) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newInterests));
        } catch (error) {
            console.error('Failed to save interests:', error);
        }
    };

    const addInterest = async (interest: string) => {
        if (!interest.trim()) return;
        const normalizedInterest = interest.trim();
        if (interests.includes(normalizedInterest)) return; // Prevent duplicates

        const newInterests = [...interests, normalizedInterest];
        setInterests(newInterests);
        await saveInterests(newInterests);
    };

    const removeInterest = async (interest: string) => {
        const newInterests = interests.filter(i => i !== interest);
        setInterests(newInterests);
        await saveInterests(newInterests);
    };

    const resetInterests = async () => {
        setInterests(DEFAULT_INTERESTS);
        await saveInterests(DEFAULT_INTERESTS);
    };

    return (
        <InterestsContext.Provider value={{ interests, addInterest, removeInterest, resetInterests, isLoading }}>
            {children}
        </InterestsContext.Provider>
    );
};

export const useInterests = () => {
    const context = useContext(InterestsContext);
    if (context === undefined) {
        throw new Error('useInterests must be used within an InterestsProvider');
    }
    return context;
};
