import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageSourcePropType,
    Pressable,
    GestureResponderEvent,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageCarousel } from './ImageCarousel';
import { colors } from '../styles/colors';
import { BottomSheetMenu } from './BottomSheetMenu';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DOUBLE_TAP_DELAY_MS = 260;

export interface SourceLink {
    id: string;
    title: string;
    url: string;
    sourceName?: string;
    imageUrl?: string;
}

interface BasePostData {
    id: string;
    topic?: string;
    votes?: number;
    /** 1 = upvoted, -1 = downvoted, 0 or undefined = no vote */
    userVote?: -1 | 0 | 1;
    isSaved?: boolean;
    date?: string;
    sources?: SourceLink[];
}

export interface ImagePostData extends BasePostData {
    type: 'image';
    images: (string | ImageSourcePropType)[];
    caption?: string;
}

export interface TextPostData extends BasePostData {
    type: 'text';
    content: string;
}

export type FeedPostData = ImagePostData | TextPostData;

interface FeedPostCardProps {
    post: FeedPostData;
    onUpvote?: (postId: string) => void;
    onDownvote?: (postId: string) => void;
    onLike?: (postId: string) => void;
    onSave?: (postId: string) => void;
    onShare?: (postId: string) => void;
    onGoInDepth?: (postId: string) => void;
    /** When true, forces any open menu to close (e.g., on scroll) */
    isMenuForceClose?: boolean;
    /** When true, shows full content without truncation and hides "See more" */
    showFullContent?: boolean;
    /** If true, adapts layout for details screen: hides top menu/header, replaces actions with metadata at bottom */
    detailsMode?: boolean;
    /** Use the immersive vertical slide layout in Home feed */
    variant?: 'default' | 'slide';
    /** Slide card height from the parent feed viewport */
    slideHeight?: number;
}

/**
 * Feed post card component for the home screen.
 * Displays an Instagram-style post with image carousel and interaction buttons.
 */
export function FeedPostCard({
    post,
    onUpvote,
    onDownvote,
    onLike,
    onSave,
    onShare,
    onGoInDepth,
    isMenuForceClose,
    showFullContent = false,
    detailsMode = false,
    variant = 'default',
    slideHeight,
}: FeedPostCardProps) {
    const [menuVisible, setMenuVisible] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSeeLessPressed, setIsSeeLessPressed] = useState(false);
    const singleTapTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCardTapRef = React.useRef(0);

    const [isTextTruncated, setIsTextTruncated] = useState(false);
    const isUpvoted = post.userVote === 1;
    const isDownvoted = post.userVote === -1;

    // Close menu when parent signals (e.g., on scroll)
    React.useEffect(() => {
        if (isMenuForceClose && menuVisible) {
            setMenuVisible(false);
        }
    }, [isMenuForceClose]);

    React.useEffect(() => {
        return () => {
            if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
            }
        };
    }, []);

    const stopPress = (event: GestureResponderEvent) => {
        event.stopPropagation();
    };

    const handleShare = (event?: GestureResponderEvent) => {
        if (event) stopPress(event);
        onShare?.(post.id);
        setMenuVisible(false);
    };

    const handleSave = (event?: GestureResponderEvent) => {
        if (event) stopPress(event);
        onSave?.(post.id);
        setMenuVisible(false);
    };

    const handleOpenMenu = (event: GestureResponderEvent) => {
        stopPress(event);
        setMenuVisible(true);
    };

    const canNavigateInDepth = Boolean(onGoInDepth) && !detailsMode;
    const isCardPressDisabled = !canNavigateInDepth && !onLike;
    const isSlideMode = variant === 'slide' && !detailsMode;

    const handleCardPress = React.useCallback(() => {
        const now = Date.now();
        const sinceLastTap = now - lastCardTapRef.current;

        if (sinceLastTap > 0 && sinceLastTap < DOUBLE_TAP_DELAY_MS) {
            if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
            }

            if (post.userVote !== 1) {
                onLike?.(post.id);
            }
            lastCardTapRef.current = 0;
            return;
        }

        lastCardTapRef.current = now;

        if (!canNavigateInDepth) {
            return;
        }

        singleTapTimeoutRef.current = setTimeout(() => {
            onGoInDepth?.(post.id);
            singleTapTimeoutRef.current = null;
            lastCardTapRef.current = 0;
        }, DOUBLE_TAP_DELAY_MS);
    }, [canNavigateInDepth, onGoInDepth, onLike, post.id, post.userVote]);

    const handleMediaPress = React.useCallback((event: GestureResponderEvent) => {
        event.stopPropagation();
        handleCardPress();
    }, [handleCardPress]);

    if (isSlideMode) {
        const cardHeight = Math.max(420, slideHeight ?? SCREEN_WIDTH * 1.3);
        const mediaWidth = SCREEN_WIDTH - 20;
        const mediaHeight = cardHeight - 12;
        const slideCaption = (post.type === 'image' ? post.caption : post.content) ?? '';
        const canExpand = slideCaption.length > 160;

        return (
            <Pressable
                style={({ pressed }) => [
                    styles.slideContainer,
                    { height: cardHeight },
                    canNavigateInDepth && pressed && styles.slideContainerPressed,
                ]}
                disabled={isCardPressDisabled}
                onPress={handleCardPress}
            >
                <BottomSheetMenu
                    visible={menuVisible}
                    onClose={() => setMenuVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.bottomSheetItem}
                        onPress={(event) => handleShare(event)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconContainer}>
                            <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
                        </View>
                        <Text style={styles.bottomSheetItemText}>Share</Text>
                    </TouchableOpacity>

                    <View style={styles.bottomSheetDivider} />

                    <TouchableOpacity
                        style={styles.bottomSheetItem}
                        onPress={(event) => handleSave(event)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconContainer}>
                            <Ionicons
                                name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                                size={24}
                                color={colors.textPrimary}
                            />
                        </View>
                        <Text style={[styles.bottomSheetItemText, post.isSaved && styles.menuItemTextSaved]}>
                            {post.isSaved ? 'Remove from Saved' : 'Save'}
                        </Text>
                    </TouchableOpacity>
                </BottomSheetMenu>

                <View style={[styles.slideMediaContainer, { height: mediaHeight }]}>
                    {post.type === 'image' ? (
                        <ImageCarousel
                            images={post.images}
                            width={mediaWidth}
                            height={mediaHeight}
                            borderRadius={22}
                            onMediaPress={handleMediaPress}
                        />
                    ) : (
                        <View style={[styles.slideTextOnly, { width: mediaWidth, height: mediaHeight }]}>
                            <Text style={styles.slideTextOnlyTitle}>{post.topic ?? 'Post'}</Text>
                            <Text style={styles.slideTextOnlyBody} numberOfLines={8}>
                                {post.content}
                            </Text>
                        </View>
                    )}

                    <View pointerEvents="none" style={styles.slideTopFade} />
                    <View pointerEvents="none" style={styles.slideBottomFade} />

                    <View style={styles.slideHeader}>
                        <View style={styles.slideMeta}>
                            {post.topic && <Text style={styles.slideTopic}>{post.topic}</Text>}
                            {post.date && <Text style={styles.slideDate}>{post.date}</Text>}
                        </View>
                        <TouchableOpacity
                            style={styles.slideMenuButton}
                            onPress={handleOpenMenu}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="ellipsis-horizontal" size={20} color={colors.white} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.slideFooter}>
                        <View style={styles.slideCopy}>
                            {slideCaption.length > 0 && (
                                <Text
                                    style={styles.slideCaption}
                                    numberOfLines={showFullContent || isExpanded ? undefined : 3}
                                >
                                    {slideCaption}
                                </Text>
                            )}
                            {canExpand && !showFullContent && !isExpanded && (
                                <TouchableOpacity
                                    onPress={(event) => {
                                        event.stopPropagation();
                                        setIsExpanded(true);
                                    }}
                                    style={styles.slideMoreTap}
                                >
                                    <Text style={styles.slideMoreText}>See more</Text>
                                </TouchableOpacity>
                            )}
                            {canExpand && !showFullContent && isExpanded && (
                                <TouchableOpacity
                                    onPress={(event) => {
                                        event.stopPropagation();
                                        setIsExpanded(false);
                                    }}
                                    style={styles.slideMoreTap}
                                >
                                    <Text style={styles.slideMoreText}>See less</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.slideActionRail}>
                            <Text style={styles.slideVotes}>{post.votes ?? 0}</Text>
                            <TouchableOpacity
                                style={styles.slideActionButton}
                                onPress={(event) => {
                                    event.stopPropagation();
                                    onUpvote?.(post.id);
                                }}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name={isUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
                                    size={30}
                                    color={colors.white}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.slideActionButton}
                                onPress={(event) => {
                                    event.stopPropagation();
                                    onDownvote?.(post.id);
                                }}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name={isDownvoted ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
                                    size={30}
                                    color={colors.white}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.slideActionButton}
                                onPress={(event) => handleSave(event)}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                                    size={24}
                                    color={colors.white}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.slideActionButton}
                                onPress={(event) => handleShare(event)}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="share-social-outline" size={24} color={colors.white} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Pressable>
        );
    }

    return (
        <Pressable
            style={({ pressed }) => [
                styles.container,
                canNavigateInDepth && pressed && styles.containerPressed,
            ]}
            disabled={isCardPressDisabled}
            onPress={handleCardPress}
            android_ripple={canNavigateInDepth ? { color: colors.surface } : undefined}
        >
            {!detailsMode && (
                <BottomSheetMenu
                    visible={menuVisible}
                    onClose={() => setMenuVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.bottomSheetItem}
                        onPress={(event) => handleShare(event)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconContainer}>
                            <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
                        </View>
                        <Text style={styles.bottomSheetItemText}>Share</Text>
                    </TouchableOpacity>

                    <View style={styles.bottomSheetDivider} />

                    <TouchableOpacity
                        style={styles.bottomSheetItem}
                        onPress={(event) => handleSave(event)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconContainer}>
                            <Ionicons
                                name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                                size={24}
                                color={colors.textPrimary}
                            />
                        </View>
                        <Text style={[styles.bottomSheetItemText, post.isSaved && styles.menuItemTextSaved]}>
                            {post.isSaved ? 'Remove from Saved' : 'Save'}
                        </Text>
                    </TouchableOpacity>
                </BottomSheetMenu>
            )}

            {/* Header with Topic, Date, and Menu - Hidden in detailsMode */}
            {!detailsMode && (
                <View style={styles.header}>
                    <View style={styles.headerTextContainer}>
                        {post.topic && <Text style={styles.topicText}>{post.topic}</Text>}
                        {post.topic && post.date && (
                            <Text style={styles.dateText}> · {post.date}</Text>
                        )}
                    </View>

                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={handleOpenMenu}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Image Carousel (Only for Image Posts) */}
            {post.type === 'image' && (
                <ImageCarousel
                    images={post.images}
                    onMediaPress={handleMediaPress}
                />
            )}

            {/* Text Content */}
            {post.type === 'text' && (
                <View style={[styles.captionContainer, styles.textPostContent]}>
                    {/* Measurement Text (Hidden) */}
                    {!showFullContent && (
                        <Text
                            style={[styles.captionText, styles.hiddenText]}
                            onTextLayout={(e) => {
                                if (e.nativeEvent.lines.length > 2 && !isTextTruncated) {
                                    setIsTextTruncated(true);
                                }
                            }}
                        >
                            {post.content.slice(0, 400)}
                        </Text>
                    )}

                    {/* Visible Text */}
                    <Text
                        style={styles.captionText}
                        numberOfLines={showFullContent || isExpanded ? undefined : 2}
                    >
                        {post.content.slice(0, 400)}

                        {!showFullContent && isExpanded && isTextTruncated && (
                            <Text
                                onPress={(event) => {
                                    event.stopPropagation();
                                    setIsExpanded(false);
                                }}
                                onPressIn={() => setIsSeeLessPressed(true)}
                                onPressOut={() => setIsSeeLessPressed(false)}
                                style={[styles.moreButton, isSeeLessPressed && { opacity: 0.5 }]}
                                suppressHighlighting={true}
                            >
                                {' See less'}
                            </Text>
                        )}
                    </Text>
                    {!showFullContent && isTextTruncated && !isExpanded && (
                        <TouchableOpacity
                            onPress={(event) => {
                                event.stopPropagation();
                                setIsExpanded(true);
                            }}
                        >
                            <Text style={styles.moreButton}>See more</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Actions row (shown in feed and details) */}
            <View style={[styles.actionsContainer, detailsMode && styles.actionsContainerDetails]}>
                <View style={styles.leftActions}>
                    {/* Upvote button */}
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(event) => {
                            event.stopPropagation();
                            onUpvote?.(post.id);
                        }}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
                            size={26}
                            color={colors.textPrimary}
                        />
                    </TouchableOpacity>
                    {/* Downvote button */}
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(event) => {
                            event.stopPropagation();
                            onDownvote?.(post.id);
                        }}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isDownvoted ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
                            size={26}
                            color={colors.textPrimary}
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.rightActions}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(event) => handleSave(event)}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
                            size={22}
                            color={colors.textPrimary}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Caption (Only for Image Posts - rendered BELOW actions) */}
            {post.type === 'image' && post.caption && (
                <View style={styles.captionContainer}>
                    {!showFullContent && (
                        <Text
                            style={[styles.captionText, styles.hiddenText]}
                            onTextLayout={(e) => {
                                if (e.nativeEvent.lines.length > 2 && !isTextTruncated) {
                                    setIsTextTruncated(true);
                                }
                            }}
                        >
                            {post.caption.slice(0, 400)}
                        </Text>
                    )}

                    <Text
                        style={styles.captionText}
                        numberOfLines={showFullContent || isExpanded ? undefined : 2}
                    >
                        {post.caption.slice(0, 400)}

                        {!showFullContent && isExpanded && isTextTruncated && (
                            <Text
                                onPress={(event) => {
                                    event.stopPropagation();
                                    setIsExpanded(false);
                                }}
                                onPressIn={() => setIsSeeLessPressed(true)}
                                onPressOut={() => setIsSeeLessPressed(false)}
                                style={[styles.moreButton, isSeeLessPressed && { opacity: 0.5 }]}
                                suppressHighlighting={true}
                            >
                                {' See less'}
                            </Text>
                        )}
                    </Text>
                    {!showFullContent && isTextTruncated && !isExpanded && (
                        <TouchableOpacity
                            onPress={(event) => {
                                event.stopPropagation();
                                setIsExpanded(true);
                            }}
                        >
                            <Text style={styles.moreButton}>See more</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    slideContainer: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#020617',
    },
    slideContainerPressed: {
        opacity: 0.92,
    },
    slideMediaContainer: {
        borderRadius: 22,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0F172A',
    },
    slideTextOnly: {
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    slideTextOnlyTitle: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '800',
        color: colors.white,
        marginBottom: 12,
    },
    slideTextOnlyBody: {
        fontSize: 16,
        lineHeight: 24,
        color: '#D7E0EC',
        textAlign: 'center',
    },
    slideTopFade: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 130,
        backgroundColor: 'rgba(2, 6, 23, 0.5)',
    },
    slideBottomFade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 210,
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
    },
    slideHeader: {
        position: 'absolute',
        top: 14,
        left: 14,
        right: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    slideMeta: {
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    slideTopic: {
        color: colors.white,
        fontSize: 13,
        fontWeight: '700',
        marginRight: 8,
    },
    slideDate: {
        color: '#CBD5E1',
        fontSize: 12,
        fontWeight: '500',
    },
    slideMenuButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    slideFooter: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 20,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    slideCopy: {
        flex: 1,
        paddingRight: 14,
    },
    slideCaption: {
        color: colors.white,
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '500',
    },
    slideMoreTap: {
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    slideMoreText: {
        color: '#E2E8F0',
        fontSize: 13,
        fontWeight: '700',
    },
    slideActionRail: {
        width: 46,
        alignItems: 'center',
    },
    slideVotes: {
        color: '#E2E8F0',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
    },
    slideActionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        borderWidth: 1,
        borderColor: 'rgba(226, 232, 240, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    container: {
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        position: 'relative',
    },
    containerPressed: {
        backgroundColor: colors.backgroundLight,
    },
    menuButton: {
        padding: 4,
        zIndex: 10,
    },
    bottomSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    iconContainer: {
        width: 40,
        alignItems: 'center',
        marginRight: 16,
    },
    bottomSheetItemText: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    menuItemTextSaved: {
        color: colors.primary,
    },
    bottomSheetDivider: {
        height: 1,
        backgroundColor: colors.surface,
        marginHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    headerTextContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    topicText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        lineHeight: 22,
        includeFontPadding: false,
    },
    dateText: {
        fontSize: 14,
        color: colors.textMuted,
        lineHeight: 22,
        includeFontPadding: false,
    },
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    actionsContainerDetails: {
        paddingTop: 14,
        paddingBottom: 12,
    },
    leftActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionButton: {
        padding: 4,
        marginRight: 6,
    },
    captionContainer: {
        marginBottom: 8,
    },
    textPostContent: {
        marginBottom: 4,
        marginTop: 4,
    },
    captionText: {
        fontSize: 14,
        color: colors.textPrimary,
        lineHeight: 20,
    },
    moreButton: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
        marginTop: 2,
    },
    hiddenText: {
        position: 'absolute',
        opacity: 0,
        zIndex: -1,
    },
});
