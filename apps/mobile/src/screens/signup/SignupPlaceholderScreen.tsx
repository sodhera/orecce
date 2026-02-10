import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { SignupStepLayout } from './SignupStepLayout';
import { CategoryCapsule } from '../../components/CategoryCapsule';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPlaceholder: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupPlaceholder'>;
    route: RouteProp<SignupStackParamList, 'SignupPlaceholder'>;
};

const TOPICS = [
    'UI',
    'Frontend',
    'AI Agents',
    'Image Processing',
    'AI Models',
    'Design Systems',
    'React Native',
    'Performance',
];

export const SignupPlaceholderScreen: React.FC<Props> = ({ navigation, route }) => {
    const { email, name, preferences } = route.params;
    const [isLoading, setIsLoading] = React.useState(true);

    // Create animated values for each topic
    const fadeAnims = useRef(TOPICS.map(() => new Animated.Value(0))).current;
    const translateYAnims = useRef(TOPICS.map(() => new Animated.Value(20))).current;

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isLoading) {
            // Stagger animation when loading finishes
            const animations = TOPICS.map((_, i) => {
                return Animated.parallel([
                    Animated.timing(fadeAnims[i], {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(translateYAnims[i], {
                        toValue: 0,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ]);
            });

            Animated.stagger(100, animations).start();
        }
    }, [isLoading, fadeAnims, translateYAnims]);

    const handleNext = () => {
        navigation.navigate('SignupCodebase', {
            email,
            name,
            preferences
        });
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const SkeletonCapsule = ({ width }: { width: number }) => (
        <View style={styles.skeletonCapsule} />
    );

    return (
        <SignupStepLayout
            currentStep={3}
            totalSteps={4}
            title="We'll keep an eye out for any news related to these and more..."
            subtitle="You can edit these anytime in the settings"
            onBack={handleBack}
            onNext={handleNext}
        >
            <View style={styles.placeholderContainer}>
                <View style={styles.topicsGrid}>
                    {isLoading ? (
                        // Skeleton capsules with random widths (2 less than actual topics)
                        [80, 100, 70, 120, 90, 60].map((width, index) => (
                            <View key={`skeleton-${index}`} style={styles.capsuleWrapper}>
                                <View style={[styles.skeletonCapsule, { width }]} />
                            </View>
                        ))
                    ) : (
                        TOPICS.map((topic, index) => (
                            <Animated.View
                                key={topic}
                                style={[
                                    styles.capsuleWrapper,
                                    {
                                        opacity: fadeAnims[index],
                                        transform: [{ translateY: translateYAnims[index] }]
                                    }
                                ]}
                            >
                                <CategoryCapsule
                                    label={topic}
                                    isActive={true}
                                    onPress={() => { }}
                                />
                            </Animated.View>
                        ))
                    )}
                </View>
            </View>
        </SignupStepLayout>
    );
};

const styles = StyleSheet.create({
    placeholderContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 40,
        paddingBottom: 180, // Move content up visually
    },
    topicsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12, // React Native 0.71+ supports gap
    },
    capsuleWrapper: {
        marginBottom: 4, // Fallback if gap isn't supported or to add extra vertical spacing
    },
    skeletonCapsule: {
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E1E4E8', // Light gray color for skeleton
        opacity: 0.6,
    },
});

export default SignupPlaceholderScreen;
