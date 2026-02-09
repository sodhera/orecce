import React, { useRef, useState } from 'react';
import {
    View,
    Image,
    FlatList,
    Dimensions,
    StyleSheet,
    NativeSyntheticEvent,
    NativeScrollEvent,
    ViewToken,
    ImageSourcePropType,
} from 'react-native';
import { colors } from '../styles/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ImageCarouselProps {
    /** Array of image URIs or local assets to display */
    images: (string | ImageSourcePropType)[];
    /** Size of the carousel (defaults to screen width with padding) */
    size?: number;
    /** Border radius for the images */
    borderRadius?: number;
}

/**
 * Instagram-style image carousel component.
 * Supports single or multiple images with swipe navigation and dot indicators.
 */
export function ImageCarousel({
    images,
    size = SCREEN_WIDTH - 32, // Default: full width minus padding
    borderRadius = 8,
}: ImageCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef<FlatList<string | ImageSourcePropType>>(null);

    // Handle viewable items change to update the active index
    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                setActiveIndex(viewableItems[0].index);
            }
        }
    ).current;

    const viewabilityConfig = useRef({
        viewAreaCoveragePercentThreshold: 50,
    }).current;

    // If no images, show placeholder
    if (!images || images.length === 0) {
        return (
            <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
                <View style={styles.placeholderInner} />
            </View>
        );
    }

    // Single image - no carousel needed
    if (images.length === 1) {
        return (
            <View style={[styles.container, { width: size }]}>
                <Image
                    source={typeof images[0] === 'string' ? { uri: images[0] } : images[0]}
                    style={[styles.image, { width: size, height: size, borderRadius }]}
                    resizeMode="cover"
                />
            </View>
        );
    }

    // Multiple images - render carousel with indicators
    return (
        <View style={[styles.container, { width: size }]}>
            <FlatList
                ref={flatListRef}
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                keyExtractor={(_, index) => `image-${index}`}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                renderItem={({ item }) => (
                    <Image
                        source={typeof item === 'string' ? { uri: item } : item}
                        style={[styles.image, { width: size, height: size, borderRadius }]}
                        resizeMode="cover"
                    />
                )}
                getItemLayout={(_, index) => ({
                    length: size,
                    offset: size * index,
                    index,
                })}
            />
            {/* Dot indicators */}
            <View style={styles.indicatorContainer}>
                {images.map((_, index) => (
                    <View
                        key={`dot-${index}`}
                        style={[
                            styles.indicator,
                            index === activeIndex ? styles.indicatorActive : styles.indicatorInactive,
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    image: {
        backgroundColor: colors.surface,
    },
    placeholder: {
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderInner: {
        width: '30%',
        height: '30%',
        backgroundColor: colors.textMuted,
        borderRadius: 8,
        opacity: 0.3,
    },
    indicatorContainer: {
        position: 'absolute',
        bottom: 12,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    indicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    indicatorActive: {
        backgroundColor: colors.white,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
    },
    indicatorInactive: {
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },
});
