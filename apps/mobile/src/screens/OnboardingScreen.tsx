import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Animated,
    ViewToken,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../styles/colors';
import { OnboardingSlide } from '../types';

const { width, height } = Dimensions.get('window');

// Onboarding slide data
const slides: OnboardingSlide[] = [
    {
        id: '1',
        icon: '✨',
        title: 'Welcome to Orecce',
        description: 'Your intelligent companion for informed decisions',
    },
    {
        id: '2',
        icon: '📊',
        title: 'Real-time Insights',
        description: 'Get live data and analytics at your fingertips',
    },
    {
        id: '3',
        icon: '🚀',
        title: 'Get Started',
        description: 'Join thousands making smarter choices',
    },
];

interface SlideItemProps {
    item: OnboardingSlide;
}

const SlideItem: React.FC<SlideItemProps> = ({ item }) => {
    return (
        <View style={styles.slide}>
            <View style={styles.iconContainer}>
                <Text style={styles.icon}>{item.icon}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
        </View>
    );
};

interface PaginationDotsProps {
    data: OnboardingSlide[];
    currentIndex: number;
    scrollX: Animated.Value;
}

const PaginationDots: React.FC<PaginationDotsProps> = ({ data, scrollX }) => {
    return (
        <View style={styles.paginationContainer}>
            {data.map((_, index) => {
                const inputRange = [
                    (index - 1) * width,
                    index * width,
                    (index + 1) * width,
                ];

                const dotWidth = scrollX.interpolate({
                    inputRange,
                    outputRange: [8, 24, 8],
                    extrapolate: 'clamp',
                });

                const opacity = scrollX.interpolate({
                    inputRange,
                    outputRange: [0.4, 1, 0.4],
                    extrapolate: 'clamp',
                });

                return (
                    <Animated.View
                        key={index}
                        style={[
                            styles.dot,
                            {
                                width: dotWidth,
                                opacity,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
};

interface OnboardingScreenProps {
    onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<FlatList<OnboardingSlide>>(null);

    const viewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                setCurrentIndex(viewableItems[0].index);
            }
        }
    ).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: false }
    );

    const scrollToNext = () => {
        if (currentIndex < slides.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            onComplete();
        }
    };

    const isLastSlide = currentIndex === slides.length - 1;

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Skip button */}
            <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
                <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={slides}
                renderItem={({ item }) => <SlideItem item={item} />}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onViewableItemsChanged={viewableItemsChanged}
                viewabilityConfig={viewConfig}
            />

            {/* Bottom section */}
            <View style={styles.bottomContainer}>
                <PaginationDots
                    data={slides}
                    currentIndex={currentIndex}
                    scrollX={scrollX}
                />

                <TouchableOpacity
                    style={[
                        styles.button,
                        isLastSlide && styles.buttonPrimary,
                    ]}
                    onPress={scrollToNext}
                    activeOpacity={0.8}
                >
                    <Text style={styles.buttonText}>
                        {isLastSlide ? 'Get Started' : 'Next'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    skipButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        padding: 10,
    },
    skipText: {
        color: colors.textSecondary,
        fontSize: 16,
        fontWeight: '500',
    },
    slide: {
        width,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    icon: {
        fontSize: 64,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 18,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 26,
    },
    bottomContainer: {
        paddingHorizontal: 20,
        paddingBottom: 50,
        alignItems: 'center',
    },
    paginationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        marginHorizontal: 4,
    },
    button: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.surface,
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    buttonText: {
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: '600',
    },
});

export default OnboardingScreen;
