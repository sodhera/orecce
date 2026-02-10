import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
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
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupName'>;
    route: RouteProp<SignupStackParamList, 'SignupName'>;
};

export const SignupNameScreen: React.FC<Props> = ({ navigation, route }) => {
    const [name, setName] = useState('');
    const { email, authMethod } = route.params;

    const handleBack = () => {
        navigation.goBack();
    };

    const handleNext = () => {
        navigation.navigate('SignupPreferences', {
            email,
            name: name.trim()
        });
    };

    return (
        <SignupStepLayout
            currentStep={1}
            totalSteps={4}
            title="What's your name?"
            subtitle="This is how you'll appear on Orecce."
            onBack={handleBack}
            onNext={handleNext}
            nextDisabled={!name.trim()}
        >
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Your first name"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoFocus
                />
            </View>
        </SignupStepLayout>
    );
};

const styles = StyleSheet.create({
    inputContainer: {
        marginTop: 8,
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

export default SignupNameScreen;
