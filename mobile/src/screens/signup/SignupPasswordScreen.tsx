import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { updateProfile } from 'firebase/auth';
import { SignupStepLayout } from './SignupStepLayout';
import { colors } from '../../styles/colors';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../config/firebase';
import { api } from '../../services/api';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupPassword'>;
    route: RouteProp<SignupStackParamList, 'SignupPassword'>;
};

export const SignupPasswordScreen: React.FC<Props> = ({ navigation, route }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { email, name, preferences, onSignupComplete } = route.params;

    const { signUp, isLoading, error } = useAuth();

    const isPasswordValid = password.length >= 6 && password === confirmPassword;

    const handleSignUp = async () => {
        if (!email) {
            Alert.alert('Email Required', 'Please go back and enter your email address.');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        const result = await signUp(email, password);

        // Save the user's display name to Firebase Auth profile
        if (result && auth.currentUser) {
            try {
                await updateProfile(auth.currentUser, {
                    displayName: name,
                });
            } catch (profileError) {
                console.error('Failed to update Firebase profile:', profileError);
            }

            // Sync user with backend to create Firestore document
            try {
                await api.syncCurrentUser();
                console.log('[signup] User synced with backend');
            } catch (syncError) {
                // Don't block signup if backend sync fails - useUser hook will retry
                console.warn('[signup] Backend sync failed (will retry later):', syncError);
            }
        }

        // Trigger the verification screen in App.tsx
        if (result && onSignupComplete) {
            onSignupComplete(email);
        }
    };

    const handleBack = () => {
        navigation.goBack();
    };

    return (
        <SignupStepLayout
            currentStep={4}
            totalSteps={4}
            title="Create your password"
            subtitle={email ? `for ${email}` : 'Set a secure password for your account'}
            onBack={handleBack}
            onNext={handleSignUp}
            nextDisabled={!isPasswordValid || isLoading}
        >
            <View style={styles.container}>
                {/* Error display */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Password inputs */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoFocus
                    />
                </View>

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
            </View>
        </SignupStepLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    input: {
        height: 56,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 18,
        color: colors.textPrimary,
        backgroundColor: colors.backgroundLight,
    },
});

export default SignupPasswordScreen;
