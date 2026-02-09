import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../styles/colors';

const { width, height } = Dimensions.get('window');

interface WelcomeScreenProps {
    onCreateAccount: () => void;
    onSignIn: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    onCreateAccount,
    onSignIn,
}) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Background with overlay */}
            <ImageBackground
                source={{ uri: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800' }}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <View style={styles.overlay} />

                {/* Content */}
                <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
                    {/* Logo at top */}
                    <View style={styles.logoContainer}>
                        <Text style={styles.logo}>Orecce</Text>
                    </View>

                    {/* Spacer */}
                    <View style={styles.spacer} />

                    {/* Headline */}
                    <Text style={styles.headline}>
                        AI analyzed news{'\n'}made just for you
                    </Text>

                    {/* Bottom section */}
                    <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
                        {/* Create account button */}
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={onCreateAccount}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.primaryButtonText}>Create an account</Text>
                        </TouchableOpacity>

                        {/* Sign in button */}
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={onSignIn}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.secondaryButtonText}>I have an account</Text>
                        </TouchableOpacity>

                        {/* Terms and Privacy */}
                        <Text style={styles.termsText}>
                            By signing up, you agree to our{' '}
                            <Text style={styles.termsLink}>Terms</Text>. See how we use your
                            {'\n'}data in our{' '}
                            <Text style={styles.termsLink}>Privacy Policy</Text>.
                        </Text>
                    </View>
                </View>
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.black,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    logoContainer: {
        alignItems: 'center',
    },
    logo: {
        fontSize: 36,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 1,
    },
    spacer: {
        flex: 1,
    },
    headline: {
        fontSize: 36,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 44,
        marginBottom: 40,
    },
    bottomSection: {
        width: '100%',
    },
    primaryButton: {
        width: '100%',
        height: 54,
        backgroundColor: colors.white,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    primaryButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.black,
    },
    secondaryButton: {
        width: '100%',
        height: 54,
        backgroundColor: 'transparent',
        borderRadius: 27,
        borderWidth: 1.5,
        borderColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    secondaryButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.white,
    },
    termsText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        lineHeight: 18,
    },
    termsLink: {
        textDecorationLine: 'underline',
    },
});

export default WelcomeScreen;
