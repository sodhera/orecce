import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SignupAuthScreen } from '../screens/signup/SignupAuthScreen';
import { SignupConnectScreen } from '../screens/signup/SignupConnectScreen';
import { SignupNameScreen } from '../screens/signup/SignupNameScreen';
import { SignupPreferencesScreen } from '../screens/signup/SignupPreferencesScreen';
import { SignupCodebaseScreen } from '../screens/signup/SignupCodebaseScreen';
import { SignupPasswordScreen } from '../screens/signup/SignupPasswordScreen';

export type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupConnect: { email: string; onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

const Stack = createNativeStackNavigator<SignupStackParamList>();

interface SignupNavigatorProps {
    onCancel: () => void;
    onSignupComplete?: (email: string) => void;
}

export const SignupNavigator: React.FC<SignupNavigatorProps> = ({ onCancel, onSignupComplete }) => {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
            }}
        >
            <Stack.Screen
                name="SignupAuth"
                component={SignupAuthScreen}
                initialParams={{ onCancel }}
            />
            <Stack.Screen name="SignupConnect" component={SignupConnectScreen} />
            <Stack.Screen name="SignupName" component={SignupNameScreen} />
            <Stack.Screen name="SignupPreferences" component={SignupPreferencesScreen} />
            <Stack.Screen name="SignupCodebase" component={SignupCodebaseScreen} />
            <Stack.Screen
                name="SignupPassword"
                component={SignupPasswordScreen}
                initialParams={{ onSignupComplete }}
            />
        </Stack.Navigator>
    );
};

export default SignupNavigator;
