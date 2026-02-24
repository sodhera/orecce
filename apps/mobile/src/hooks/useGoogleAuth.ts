import { useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';

// Required for web browser to close properly after auth
WebBrowser.maybeCompleteAuthSession();

type ExpoExtra = {
    googleWebClientId?: string;
    googleIosClientId?: string;
    googleAndroidClientId?: string;
};

type ProcessEnv = Record<string, string | undefined>;
type ProcessLike = { env?: ProcessEnv };

const runtimeEnv = (globalThis as { process?: ProcessLike }).process?.env ?? {};
const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

const GOOGLE_WEB_CLIENT_ID =
    runtimeEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? expoExtra.googleWebClientId ?? '';
const GOOGLE_IOS_CLIENT_ID =
    runtimeEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? expoExtra.googleIosClientId ?? '';
const GOOGLE_ANDROID_CLIENT_ID =
    runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? expoExtra.googleAndroidClientId ?? '';

const DEFAULT_CLIENT_ID =
    GOOGLE_WEB_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || 'MISSING_GOOGLE_CLIENT_ID';

const MISSING_CLIENT_ID_MESSAGE = 'Google sign in is not configured. Add Google OAuth client IDs.';

function getMissingClientIds(): string[] {
    const missing: string[] = [];

    if (!GOOGLE_WEB_CLIENT_ID) {
        missing.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    }

    if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
        missing.push('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
    }

    if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) {
        missing.push('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID');
    }

    return missing;
}

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

    const [request, _response, promptAsync] = Google.useIdTokenAuthRequest({
        webClientId: GOOGLE_WEB_CLIENT_ID || DEFAULT_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || DEFAULT_CLIENT_ID,
        androidClientId: GOOGLE_ANDROID_CLIENT_ID || DEFAULT_CLIENT_ID,
        selectAccount: true,
    });

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const missingClientIds = getMissingClientIds();
            if (missingClientIds.length > 0) {
                setError(`${MISSING_CLIENT_ID_MESSAGE} Missing: ${missingClientIds.join(', ')}`);
                return false;
            }

            if (!request) {
                setError('Google sign in is still initializing. Please try again.');
                return false;
            }

            const result = await promptAsync();

            if (result.type === 'success') {
                const authResult = result as typeof result & {
                    authentication?: { idToken?: string; accessToken?: string };
                };
                const idToken = result.params.id_token || authResult.authentication?.idToken;
                const accessToken = result.params.access_token || authResult.authentication?.accessToken;
                const credential = idToken
                    ? GoogleAuthProvider.credential(idToken)
                    : accessToken
                        ? GoogleAuthProvider.credential(null, accessToken)
                        : null;

                if (!credential) {
                    setError('Google sign in did not return a usable token.');
                    return false;
                }

                await signInWithCredential(auth, credential);
                return true;
            } else if (result.type === 'cancel') {
                return false;
            } else {
                setError('Failed to sign in with Google');
                return false;
            }
        } catch (err: unknown) {
            console.error('Google sign in error:', err);
            const errorMessage = (err as { message?: string }).message || 'Failed to sign in with Google';
            setError(errorMessage);
            return false;
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
