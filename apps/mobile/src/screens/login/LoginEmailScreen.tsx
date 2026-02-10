import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Keyboard, Platform, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../styles/colors';

type LoginStackParamList = {
    LoginAuth: { onCancel: () => void };
    LoginEmail: undefined;
    LoginPassword: { email: string };
};

type Props = {
    navigation: NativeStackNavigationProp<LoginStackParamList, 'LoginEmail'>;
};

export const LoginEmailScreen: React.FC<Props> = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const insets = useSafeAreaInsets();
    const [keyboardOffset] = useState(new Animated.Value(0));

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const keyboardShowListener = Keyboard.addListener(showEvent, (e) => {
            Animated.timing(keyboardOffset, {
                toValue: e.endCoordinates.height - insets.bottom,
                duration: Platform.OS === 'ios' ? e.duration : 250,
                useNativeDriver: false,
            }).start();
        });

        const keyboardHideListener = Keyboard.addListener(hideEvent, (e) => {
            Animated.timing(keyboardOffset, {
                toValue: 0,
                duration: Platform.OS === 'ios' ? e.duration : 250,
                useNativeDriver: false,
            }).start();
        });

        return () => {
            keyboardShowListener.remove();
            keyboardHideListener.remove();
        };
    }, [keyboardOffset, insets.bottom]);

    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    };

    const handleNext = () => {
        navigation.navigate('LoginPassword', { email: email.trim() });
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    return (
        <TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
            <View style={styles.container}>
                {/* Progress bar */}
                <View style={[styles.progressContainer, { marginTop: insets.top + 10 }]}>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: '50%' }]} />
                    </View>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={styles.title}>What's your email?</Text>
                    <Text style={styles.subtitle}>Enter the email associated with your account.</Text>

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

                {/* Bottom navigation - animated with keyboard */}
                <Animated.View style={[
                    styles.bottomSection,
                    {
                        paddingBottom: insets.bottom + 20,
                        transform: [{ translateY: Animated.multiply(keyboardOffset, -1) }],
                    }
                ]}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>‹</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.nextButton, !isValidEmail(email) && styles.nextButtonDisabled]}
                        onPress={handleNext}
                        disabled={!isValidEmail(email)}
                    >
                        <Text style={[styles.nextButtonText, !isValidEmail(email) && styles.nextButtonTextDisabled]}>›</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </TouchableWithoutFeedback>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    progressContainer: {
        paddingHorizontal: 24,
        marginBottom: 40,
    },
    progressTrack: {
        height: 4,
        backgroundColor: colors.surface,
        borderRadius: 2,
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.textPrimary,
        borderRadius: 2,
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
        marginBottom: 32,
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
    bottomSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        backgroundColor: colors.background,
    },
    backButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButtonText: {
        fontSize: 24,
        color: colors.textPrimary,
        fontWeight: '400',
        marginRight: 2,
        marginTop: -2,
    },
    nextButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextButtonDisabled: {
        backgroundColor: colors.surface,
    },
    nextButtonText: {
        fontSize: 24,
        color: colors.white,
        fontWeight: '400',
        marginLeft: 2,
        marginTop: -2,
    },
    nextButtonTextDisabled: {
        color: colors.textMuted,
    },
});

export default LoginEmailScreen;

