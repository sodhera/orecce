import { useState, useEffect, useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID =
    Constants.expoConfig?.extra?.googleWebClientId ??
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
    '';

interface GoogleAuthState {
    isLoading: boolean;
    error: string | null;
}

interface GoogleAuthActions {
    signInWithGoogle: () => Promise<boolean>;
}

export function useGoogleAuth(): GoogleAuthState & GoogleAuthActions {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [request, response, promptAsync] = AuthSession.useAuthRequest(
        {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: AuthSession.makeRedirectUri(),
            responseType: AuthSession.ResponseType.IdToken,
            scopes: ['openid', 'profile', 'email'],
        },
        { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
    );

    useEffect(() => {
        if (response?.type !== 'success') return;

        const idToken = response.params?.id_token;
        if (!idToken) {
            setError('No ID token received from Google');
            setIsLoading(false);
            return;
        }

        // Sign in to Supabase with the Google ID token
        (async () => {
            try {
                const { error: authError } = await supabase.auth.signInWithIdToken({
                    provider: 'google',
                    token: idToken,
                });
                if (authError) {
                    setError(authError.message);
                }
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Google sign-in failed');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [response]);

    const signInWithGoogle = useCallback(async (): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);

            if (!request) {
                setError('Google Auth is not ready');
                setIsLoading(false);
                return false;
            }

            const result = await promptAsync();
            if (result.type !== 'success') {
                setIsLoading(false);
                return false;
            }
            // The useEffect above will handle the Supabase sign-in
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed');
            setIsLoading(false);
            return false;
        }
    }, [request, promptAsync]);

    return {
        isLoading,
        error,
        signInWithGoogle,
    };
}

export default useGoogleAuth;
