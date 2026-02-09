import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../styles/colors';

type Props = {
    email: string;
    onLater: () => void;
};

export const SignupVerifyEmailScreen: React.FC<Props> = ({ email, onLater }) => {
    const insets = useSafeAreaInsets();

    const handleOpenEmail = () => {
        // Try to open the default mail app
        if (Platform.OS === 'ios') {
            Linking.openURL('message://');
        } else {
            Linking.openURL('mailto:');
        }
    };

    return (
        <View style={styles.container}>
            {/* Header with Later button */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.spacer} />
                <TouchableOpacity onPress={onLater}>
                    <Text style={styles.laterText}>Later</Text>
                </TouchableOpacity>
            </View>

            {/* Main content */}
            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Ionicons name="mail-outline" size={64} color={colors.textPrimary} />
                </View>

                <Text style={styles.title}>Almost done!</Text>
                <Text style={styles.subtitle}>
                    We've sent a verification link to{'\n'}
                    <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
                <Text style={styles.description}>
                    Please check your email and click the verification link to complete your account setup.
                </Text>
            </View>

            {/* Footer */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                <TouchableOpacity style={styles.resendButton} onPress={handleOpenEmail}>
                    <Text style={styles.resendButtonText}>Open Email App</Text>
                </TouchableOpacity>

                <Text style={styles.footerNote}>
                    Didn't receive an email? Check your spam folder or try re-signing up.
                </Text>
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
    spacer: {
        width: 48,
    },
    laterText: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 60,
        alignItems: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        color: colors.textSecondary,
        lineHeight: 26,
        textAlign: 'center',
        marginBottom: 16,
    },
    emailHighlight: {
        color: colors.textPrimary,
        fontWeight: '600',
    },
    description: {
        fontSize: 16,
        color: colors.textMuted,
        lineHeight: 24,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    footer: {
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    resendButton: {
        height: 56,
        backgroundColor: colors.textPrimary,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginBottom: 16,
    },
    resendButtonText: {
        fontSize: 16,
        color: colors.white,
        fontWeight: '600',
    },
    footerNote: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default SignupVerifyEmailScreen;
