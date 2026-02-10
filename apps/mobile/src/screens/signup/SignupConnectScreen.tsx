import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../styles/colors';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupConnect: { email: string; onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupConnect'>;
    route: RouteProp<SignupStackParamList, 'SignupConnect'>;
};

export const SignupConnectScreen: React.FC<Props> = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const { email, onCancel } = route.params;
    const { signInWithGoogle, isLoading: googleLoading } = useGoogleAuth();

    const handleBack = () => {
        navigation.goBack();
    };

    const handleSkip = () => {
        navigation.navigate('SignupName', {
            email,
            authMethod: 'email',
        });
    };

    const handleGoogleConnect = async () => {
        await signInWithGoogle();
        // On success, navigate to next screen
        navigation.navigate('SignupName', {
            email,
            authMethod: 'google',
        });
    };

    const handleAppleConnect = () => {
        navigation.navigate('SignupName', {
            email,
            authMethod: 'apple',
        });
    };

    return (
        <View style={styles.container}>
            {/* Header with close and skip buttons */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity style={styles.closeButton} onPress={handleBack}>
                    <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkip}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
            </View>

            {/* Main content */}
            <View style={styles.content}>
                <Text style={styles.title}>Connect an account to log in faster</Text>
                <Text style={styles.subtitle}>
                    If your phone number or email changes, use your connected account to log in and update your profile.
                </Text>
            </View>

            {/* Social auth buttons */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                {/* Google button */}
                <TouchableOpacity
                    style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
                    onPress={handleGoogleConnect}
                    disabled={googleLoading}
                >
                    <Ionicons name="logo-google" size={20} color={colors.textPrimary} style={styles.buttonIcon} />
                    <Text style={styles.googleButtonText}>
                        {googleLoading ? 'Connecting...' : 'Continue with Google'}
                    </Text>
                </TouchableOpacity>

                {/* Apple button */}
                <TouchableOpacity
                    style={styles.appleButton}
                    onPress={handleAppleConnect}
                >
                    <Ionicons name="logo-apple" size={22} color={colors.textPrimary} style={styles.buttonIcon} />
                    <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    closeButton: {
        padding: 8,
        marginLeft: -8,
    },
    skipText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        letterSpacing: 0.5,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 16,
        lineHeight: 36,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    footer: {
        paddingHorizontal: 24,
    },
    buttonIcon: {
        marginRight: 12,
    },
    googleButton: {
        height: 56,
        backgroundColor: colors.backgroundLight,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    googleButtonText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    appleButton: {
        height: 56,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.surface,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    appleButtonText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
});

export default SignupConnectScreen;
