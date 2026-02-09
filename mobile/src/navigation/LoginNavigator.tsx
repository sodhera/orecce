import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginAuthScreen } from '../screens/login/LoginAuthScreen';
import { LoginEmailScreen } from '../screens/login/LoginEmailScreen';
import { LoginPasswordScreen } from '../screens/login/LoginPasswordScreen';

export type LoginStackParamList = {
    LoginAuth: { onCancel: () => void };
    LoginEmail: undefined;
    LoginPassword: { email: string };
};

const Stack = createNativeStackNavigator<LoginStackParamList>();

interface LoginNavigatorProps {
    onCancel: () => void;
}

export const LoginNavigator: React.FC<LoginNavigatorProps> = ({ onCancel }) => {
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
                name="LoginAuth"
                component={LoginAuthScreen}
                initialParams={{ onCancel }}
            />
            <Stack.Screen name="LoginEmail" component={LoginEmailScreen} />
            <Stack.Screen name="LoginPassword" component={LoginPasswordScreen} />
        </Stack.Navigator>
    );
};

export default LoginNavigator;
