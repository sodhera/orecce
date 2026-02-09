import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../styles/colors';
import { useAuth } from '../hooks/useAuth';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

type AuthMode = 'login' | 'signup';

interface AuthScreenProps {
    initialMode?: AuthMode;
    onBack?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
    initialMode = 'login',
    onBack
}) => {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const insets = useSafeAreaInsets();

    const { signIn, signUp, resetPassword, isLoading, error, clearError } = useAuth();
    const { signInWithGoogle, isLoading: googleLoading } = useGoogleAuth();

    const isLogin = mode === 'login';

    const handleAuth = async () => {
        clearError();

        if (isLogin) {
            await signIn(email, password);
        } else {
            if (password !== confirmPassword) {
                Alert.alert('Error', 'Passwords do not match');
                return;
            }
            await signUp(email, password);
        }
    };

    const handleForgotPassword = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email address first');
            return;
        }

        const success = await resetPassword(email);
        if (success) {
            Alert.alert(
                'Password Reset',
                'Check your email for a password reset link'
            );
        }
    };

    const toggleMode = () => {
        setMode(isLogin ? 'signup' : 'login');
        setConfirmPassword('');
        clearError();
    };

    const isFormValid = () => {
        if (!email.trim() || !password.trim()) return false;
        if (!isLogin && password !== confirmPassword) return false;
        return true;
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="dark" />

            {/* Back button */}
            {onBack && (
                <TouchableOpacity
                    style={[styles.backButton, { top: insets.top + 10 }]}
                    onPress={onBack}
                >
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
            )}

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 60 }
                ]}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.logo}>Orecce</Text>
                    <Text style={styles.title}>
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </Text>
                    <Text style={styles.subtitle}>
                        {isLogin
                            ? 'Sign in to continue to Orecce'
                            : 'Sign up to get started with Orecce'}
                    </Text>
                </View>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Form */}
                <View style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your email"
                            placeholderTextColor={colors.textMuted}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your password"
                            placeholderTextColor={colors.textMuted}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    {!isLogin && (
                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Confirm Password</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Confirm your password"
                                placeholderTextColor={colors.textMuted}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry
                            />
                        </View>
                    )}

                    {isLogin && (
                        <TouchableOpacity
                            style={styles.forgotButton}
                            onPress={handleForgotPassword}
                        >
                            <Text style={styles.forgotText}>Forgot Password?</Text>
                        </TouchableOpacity>
                    )}

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={[
                            styles.submitButton,
                            (!isFormValid() || isLoading) && styles.submitButtonDisabled,
                        ]}
                        onPress={handleAuth}
                        disabled={!isFormValid() || isLoading}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.submitButtonText}>
                            {isLoading
                                ? 'Please wait...'
                                : isLogin
                                    ? 'Sign In'
                                    : 'Create Account'}
                        </Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Google Sign In */}
                    <TouchableOpacity
                        style={[styles.socialButton, googleLoading && styles.socialButtonDisabled]}
                        onPress={signInWithGoogle}
                        disabled={googleLoading}
                    >
                        <Text style={styles.socialIcon}>G</Text>
                        <Text style={styles.socialButtonText}>
                            {googleLoading ? 'Signing in...' : 'Continue with Google'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Toggle Mode */}
                <View style={styles.toggleContainer}>
                    <Text style={styles.toggleText}>
                        {isLogin ? "Don't have an account? " : 'Already have an account? '}
                    </Text>
                    <TouchableOpacity onPress={toggleMode}>
                        <Text style={styles.toggleLink}>
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    backButton: {
        position: 'absolute',
        left: 20,
        zIndex: 10,
        padding: 8,
    },
    backButtonText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    logo: {
        fontSize: 32,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 20,
        letterSpacing: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    errorContainer: {
        backgroundColor: '#FEE2E2',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        color: colors.error,
        fontSize: 14,
        textAlign: 'center',
    },
    form: {
        marginBottom: 24,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        height: 52,
        backgroundColor: colors.backgroundLight,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.surface,
    },
    forgotButton: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotText: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: '500',
    },
    submitButton: {
        height: 56,
        backgroundColor: colors.primary,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    submitButtonDisabled: {
        backgroundColor: colors.surface,
    },
    submitButtonText: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.white,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
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
    socialButton: {
        height: 52,
        backgroundColor: colors.backgroundLight,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.surface,
    },
    socialButtonDisabled: {
        opacity: 0.6,
    },
    socialIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    socialButtonText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    toggleText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    toggleLink: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: '600',
    },
});

export default AuthScreen;
