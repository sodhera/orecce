import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { SignupStepLayout } from './SignupStepLayout';
import { colors } from '../../styles/colors';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupConnect: { email: string; onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupAuth'>;
    route: RouteProp<SignupStackParamList, 'SignupAuth'>;
};

export const SignupAuthScreen: React.FC<Props> = ({ navigation, route }) => {
    const [email, setEmail] = useState('');
    const { onCancel } = route.params;

    // Handle swipe-back gesture on first screen
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            // Prevent default behavior of leaving the screen
            e.preventDefault();
            // Call onCancel to properly animate back to welcome
            onCancel();
        });

        return unsubscribe;
    }, [navigation, onCancel]);

    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    };

    const handleNext = () => {
        navigation.navigate('SignupConnect', {
            email: email.trim(),
            onCancel,
        });
    };

    const handleBack = () => {
        onCancel();
    };

    return (
        <SignupStepLayout
            currentStep={1}
            totalSteps={5}
            title="What's your email?"
            subtitle="We'll use this to sign you in and recover your account."
            onBack={handleBack}
            onNext={handleNext}
            nextDisabled={!isValidEmail(email)}
            showProgressBar={false}
            backButtonPosition="top"
        >
            <View style={styles.container}>
                {/* Email input */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Your email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="email@example.com"
                        placeholderTextColor={colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
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
    inputContainer: {
        marginTop: 8,
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

export default SignupAuthScreen;
