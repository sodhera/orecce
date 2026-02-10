import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Keyboard,
    Platform,
    Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../styles/colors';

interface SignupStepLayoutProps {
    currentStep: number;
    totalSteps: number;
    title: string;
    subtitle?: string;
    onBack?: () => void;
    onNext: () => void;
    onSkip?: () => void;
    nextDisabled?: boolean;
    showProgressBar?: boolean;
    backButtonPosition?: 'top' | 'bottom';
    nextLabel?: string;
    children: React.ReactNode;
}

export const SignupStepLayout: React.FC<SignupStepLayoutProps> = ({
    currentStep,
    totalSteps,
    title,
    subtitle,
    onBack,
    onNext,
    onSkip,
    nextDisabled = false,
    showProgressBar = true,
    backButtonPosition = 'bottom',
    nextLabel = '›',
    children,
}) => {
    const insets = useSafeAreaInsets();
    const progress = currentStep / totalSteps;
    const [keyboardOffset] = useState(new Animated.Value(0));
    const isPlainNext = nextLabel.toLowerCase() === 'skip';
    const [ctaOpacity] = useState(new Animated.Value(1));

    useEffect(() => {
        ctaOpacity.setValue(0);
        Animated.timing(ctaOpacity, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
        }).start();
    }, [nextLabel]);

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



    return (
        <View style={styles.container}>
            {/* Progress bar - only show if enabled */}
            {showProgressBar && (
                <View style={[styles.progressContainer, { marginTop: insets.top + 10 }]}>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                </View>
            )}

            {/* Top spacing when no progress bar */}
            {!showProgressBar && (
                <View style={{ height: insets.top + 20 }} />
            )}

            {/* Back button at top - only if position is 'top' */}
            {onBack && backButtonPosition === 'top' && (
                <TouchableOpacity style={styles.backButtonTop} onPress={onBack}>
                    <Text style={styles.backButtonTopText}>‹</Text>
                </TouchableOpacity>
            )}

            <View style={styles.mainContent}>
                {/* Title section */}
                <View style={styles.headerSection}>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>

                {/* Content */}
                <View style={styles.contentSection}>
                    {children}
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
                {/* Back button at bottom left */}
                {onBack && backButtonPosition === 'bottom' ? (
                    <TouchableOpacity style={styles.backButtonBottom} onPress={onBack}>
                        <Text style={styles.backButtonBottomText}>‹</Text>
                    </TouchableOpacity>
                ) : onSkip ? (
                    <TouchableOpacity onPress={onSkip}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.spacer} />
                )}

                <Animated.View
                    style={{
                        opacity: ctaOpacity,
                    }}
                >
                    <TouchableOpacity
                        style={[
                            styles.nextButton,
                            nextDisabled && styles.nextButtonDisabled,
                            isPlainNext && styles.nextButtonPlain,
                        ]}
                        onPress={onNext}
                        disabled={nextDisabled}
                        activeOpacity={0.8}
                    >
                        <Text style={[
                            styles.nextButtonText,
                            nextDisabled && styles.nextButtonTextDisabled,
                            isPlainNext && styles.nextButtonTextPlain,
                        ]}>{nextLabel}</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    progressContainer: {
        paddingHorizontal: 24,
        marginBottom: 20,
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
    backButtonTop: {
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 10,
        padding: 8,
    },
    backButtonTopText: {
        fontSize: 32,
        color: colors.textPrimary,
        fontWeight: '300',
    },
    backButtonBottom: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButtonBottomText: {
        fontSize: 24,
        color: colors.textPrimary,
        fontWeight: '400',
        marginRight: 2,
        marginTop: -2,
    },
    mainContent: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    headerSection: {
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 12,
        lineHeight: 36,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    contentSection: {
        flex: 1,
    },
    bottomSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        backgroundColor: 'transparent',
    },
    spacer: {
        width: 48,
    },
    skipText: {
        fontSize: 16,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    nextButton: {
        minWidth: 48,
        height: 48,
        paddingHorizontal: 16,
        borderRadius: 24,
        backgroundColor: colors.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextButtonDisabled: {
        backgroundColor: colors.surface,
    },
    nextButtonPlain: {
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        minWidth: undefined,
        height: 32,
        borderRadius: 0,
    },
    nextButtonText: {
        fontSize: 18,
        color: colors.white,
        fontWeight: '600',
        marginLeft: 2,
        marginTop: -2,
    },
    nextButtonTextDisabled: {
        color: colors.textMuted,
    },
    nextButtonTextPlain: {
        fontSize: 16,
        color: colors.textSecondary,
        fontWeight: '600',
        marginLeft: 0,
        marginTop: 0,
    },
});

export default SignupStepLayout;
