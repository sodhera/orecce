import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageSourcePropType, Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageCarousel } from './ImageCarousel';
import { colors } from '../styles/colors';
import { BottomSheetMenu } from './BottomSheetMenu';

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
    onSave?: (postId: string) => void;
    onShare?: (postId: string) => void;
    onPress?: (postId: string) => void;
    onGoInDepth?: (postId: string) => void;
    /** When true, forces any open menu to close (e.g., on scroll) */
    isMenuForceClose?: boolean;
    /** When true, shows full content without truncation and hides "See more" */
    showFullContent?: boolean;
    /** If true, adapts layout for details screen: hides top menu/header, replaces actions with metadata at bottom */
    detailsMode?: boolean;
}

/**
 * Feed post card component for the home screen.
 * Displays an Instagram-style post with image carousel and interaction buttons.
 */
export function FeedPostCard({
    post,
    onUpvote,
    onDownvote,
    onSave,
    onShare,
    onPress,
    onGoInDepth,
    isMenuForceClose,
    showFullContent = false,
    detailsMode = false,
}: FeedPostCardProps) {
    const [menuVisible, setMenuVisible] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSeeLessPressed, setIsSeeLessPressed] = useState(false);

    const [isTextTruncated, setIsTextTruncated] = useState(false);
    const isUpvoted = post.userVote === 1;
    const isDownvoted = post.userVote === -1;

    // Close menu when parent signals (e.g., on scroll)
    React.useEffect(() => {
        if (isMenuForceClose && menuVisible) {
            setMenuVisible(false);
        }
    }, [isMenuForceClose]);

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

    const isCardPressDisabled = !onGoInDepth || detailsMode;

    return (
        <Pressable
            style={({ pressed }) => [
                styles.container,
                !isCardPressDisabled && pressed && styles.containerPressed,
            ]}
            disabled={isCardPressDisabled}
            onPress={() => onGoInDepth?.(post.id)}
            android_ripple={isCardPressDisabled ? undefined : { color: colors.surface }}
        >
            {/* Menu button moved to header */}

            {/* Bottom Sheet Menu - Hidden in detailsMode */}
            {/* Bottom Sheet Menu - Hidden in detailsMode */}
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
                <ImageCarousel images={post.images} />
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
            {
                post.type === 'image' && post.caption && (
                    <View style={styles.captionContainer}>
                        {/* Measurement Text (Hidden) - Only needed if not showing full content */}
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

                        {/* Visible Text */}
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
                )
            }
        </Pressable >
    );
}

const styles = StyleSheet.create({
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
