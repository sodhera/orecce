import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { SignupStepLayout } from './SignupStepLayout';
import { colors } from '../../styles/colors';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupPreferences'>;
    route: RouteProp<SignupStackParamList, 'SignupPreferences'>;
};

export const SignupPreferencesScreen: React.FC<Props> = ({ navigation, route }) => {
    const [preferences, setPreferences] = useState('');
    const { email, name } = route.params;

    // Placeholder text for the bottom scrollable box
    const handleNext = () => {
        navigation.navigate('SignupCodebase', {
            email,
            name,
            preferences: preferences.trim()
        });
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const handleSkip = () => {
        navigation.navigate('SignupCodebase', {
            email,
            name,
            preferences: ''
        });
    };

    return (
        <SignupStepLayout
            currentStep={2}
            totalSteps={4}
            title="What would you like to see?"
            subtitle="Tell us about your startup & what you're working on"
            onBack={handleBack}
            onNext={handleNext}
            onSkip={handleSkip}
            nextDisabled={!preferences.trim()}
        >
            <View style={styles.container}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.textArea}
                        value={preferences}
                        onChangeText={setPreferences}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        autoFocus
                    />
                    {!preferences && (
                        <Text style={styles.placeholder} pointerEvents="none">
                            My current project is X, and I mostly look over frontend, Design, UI, images, animations. I like to know about image processing, AI models, etc.
                        </Text>
                    )}
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
    textArea: {
        height: 140,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingTop: 16,
        fontSize: 16,
        color: colors.textPrimary,
        backgroundColor: colors.backgroundLight,
        lineHeight: 24,
    },
    placeholder: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        fontSize: 16,
        color: colors.textMuted,
        lineHeight: 24,
    },
});

export default SignupPreferencesScreen;
