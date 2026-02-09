import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../styles/colors';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';

type LoginStackParamList = {
    LoginAuth: { onCancel: () => void };
    LoginEmail: undefined;
    LoginPassword: { email: string };
};

type Props = {
    navigation: NativeStackNavigationProp<LoginStackParamList, 'LoginAuth'>;
    route: RouteProp<LoginStackParamList, 'LoginAuth'>;
};

export const LoginAuthScreen: React.FC<Props> = ({ navigation, route }) => {
    const { onCancel } = route.params;
    const { signInWithGoogle, isLoading: googleLoading } = useGoogleAuth();
    const insets = useSafeAreaInsets();

    // Handle hardware back button / beforeRemove
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            e.preventDefault();
            onCancel();
        });

        return unsubscribe;
    }, [navigation, onCancel]);

    const handleBack = () => {
        onCancel();
    };

    const handleEmailLogin = () => {
        navigation.navigate('LoginEmail');
    };

    const handleGoogleLogin = async () => {
        await signInWithGoogle();
    };

    const handleAppleLogin = async () => {
        // Apple sign in - would trigger Apple OAuth
    };

    return (
        <View style={styles.container}>
            {/* Back button */}
            <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
            >
                <Text style={styles.backButtonText}>‹</Text>
            </TouchableOpacity>

            {/* Content */}
            <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
                <Text style={styles.title}>Welcome back!</Text>
                <Text style={styles.subtitle}>How would you like to sign in?</Text>

                <View style={styles.buttonsContainer}>
                    {/* Email option */}
                    <TouchableOpacity
                        style={styles.emailButton}
                        onPress={handleEmailLogin}
                    >
                        <Ionicons name="mail-outline" size={22} color={colors.textPrimary} style={styles.buttonIcon} />
                        <Text style={styles.emailButtonText}>Continue with Email</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Google button */}
                    <TouchableOpacity
                        style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
                        onPress={handleGoogleLogin}
                        disabled={googleLoading}
                    >
                        <Ionicons name="logo-google" size={20} color={colors.textPrimary} style={styles.buttonIcon} />
                        <Text style={styles.googleButtonText}>
                            {googleLoading ? 'Signing in...' : 'Continue with Google'}
                        </Text>
                    </TouchableOpacity>

                    {/* Apple button */}
                    <TouchableOpacity
                        style={styles.appleButton}
                        onPress={handleAppleLogin}
                    >
                        <Ionicons name="logo-apple" size={22} color={colors.white} style={styles.buttonIcon} />
                        <Text style={styles.appleButtonText}>Continue with Apple</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    backButton: {
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 10,
        padding: 8,
    },
    backButtonText: {
        fontSize: 32,
        color: colors.textPrimary,
        fontWeight: '300',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 40,
    },
    buttonsContainer: {
        flex: 1,
    },
    buttonIcon: {
        marginRight: 12,
    },
    emailButton: {
        height: 56,
        backgroundColor: colors.backgroundLight,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    emailButtonText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.surface,
    },
    dividerText: {
        fontSize: 14,
        color: colors.textMuted,
        marginHorizontal: 16,
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
        backgroundColor: colors.black,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    appleButtonText: {
        fontSize: 16,
        color: colors.white,
        fontWeight: '500',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
});

export default LoginAuthScreen;
