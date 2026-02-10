import { useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';

// Required for web browser to close properly after auth
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Client IDs
// Get these from: https://console.cloud.google.com/apis/credentials
// You need to create OAuth 2.0 Client IDs for:
// - Web application (for Expo Go and web)
// - iOS (for standalone iOS app)
// - Android (for standalone Android app)
const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

interface GoogleAuthState {
    isLoading: boolean;
    error: string | null;
}

interface GoogleAuthActions {
    signInWithGoogle: () => Promise<void>;
}

export function useGoogleAuth(): GoogleAuthState & GoogleAuthActions {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [_request, _response, promptAsync] = Google.useAuthRequest({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    });

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const result = await promptAsync();

            if (result.type === 'success') {
                const { id_token } = result.params;
                const credential = GoogleAuthProvider.credential(id_token);
                await signInWithCredential(auth, credential);
            } else if (result.type === 'cancel') {
                setError('Sign in was cancelled');
            } else {
                setError('Failed to sign in with Google');
            }
        } catch (err: unknown) {
            console.error('Google sign in error:', err);
            const errorMessage = (err as { message?: string }).message || 'Failed to sign in with Google';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isLoading,
        error,
        signInWithGoogle,
    };
}

export default useGoogleAuth;
