import React from 'react';
import {
    StyleSheet,
    View,
    FlatList,
    RefreshControl,
    Animated,
    Text,
    TouchableOpacity,
    LayoutChangeEvent,
    ViewToken,
} from 'react-native';
import { FeedPostCard, FeedPostData } from '../components';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useToast } from '../context/ToastContext';
import { listAllPostFeedback, PostFeedbackType, sendPostFeedback, StoredPostFeedback } from '../services/api';

const FEED_DATA: FeedPostData[] = [
    {
        id: '1',
        type: 'image',
        images: [require('../../assets/images/post_1.png')],
        topic: 'AI Agents',
        caption: 'Codex released a Mac app. You can run multiple agents in the same window, which opens the door for tighter Orecce workflows.',
        votes: 248,
        userVote: 0,
        isSaved: false,
        date: 'Jan 27, 2026',
    },
    {
        id: '2',
        type: 'image',
        images: [require('../../assets/images/post_2.png')],
        topic: 'Venture Capital',
        caption: 'QIA expanded its VC program from $1B to $3B and introduced a 10-year founder residency lane.',
        votes: 89,
        userVote: 0,
        isSaved: false,
        date: 'Jan 26, 2026',
    },
    {
        id: '3',
        type: 'image',
        images: [require('../../assets/images/post_3.png')],
        topic: 'Startups',
        caption: 'YC RFS includes AI-native agencies, stablecoin services, and AI for physical work categories.',
        votes: 1024,
        userVote: 0,
        isSaved: true,
        date: 'Jan 25, 2026',
        sources: [
            {
                id: 'yc-rfs-1',
                title: 'Requests for Startups',
                url: 'https://www.ycombinator.com/rfs',
                sourceName: 'Y Combinator',
            },
        ],
    },
    {
        id: '4',
        type: 'image',
        images: [require('../../assets/images/post_2.png')],
        topic: 'Climate Tech',
        caption: 'Grid software startups are reducing curtailment by combining realtime demand prediction with battery orchestration.',
        votes: 173,
        userVote: 0,
        isSaved: false,
        date: 'Jan 24, 2026',
    },
    {
        id: '5',
        type: 'image',
        images: [require('../../assets/images/post_3.png')],
        topic: 'Developer Tools',
        caption: 'Teams are moving from prompt libraries to eval-driven product loops that continuously measure model quality.',
        votes: 331,
        userVote: 0,
        isSaved: false,
        date: 'Jan 23, 2026',
    },
    {
        id: '6',
        type: 'text',
        topic: 'Security',
        content: 'AI-generated phishing is now high-volume and personalized. Startups focused on defensive copilots and anomaly detection are seeing strong enterprise pull.',
        votes: 211,
        userVote: 0,
        isSaved: false,
        date: 'Jan 22, 2026',
    },
];

const DEFAULT_FEED_HEIGHT = 640;
type VoteValue = -1 | 0 | 1;
type VoteFeedbackType = 'upvote' | 'downvote' | 'skip';
type SaveFeedbackType = 'save' | 'unsave';

function toVoteFeedbackType(vote: VoteValue): VoteFeedbackType {
    if (vote === 1) return 'upvote';
    if (vote === -1) return 'downvote';
    return 'skip';
}

function isVoteFeedbackType(type: PostFeedbackType): type is VoteFeedbackType {
    return type === 'upvote' || type === 'downvote' || type === 'skip';
}

function isSaveFeedbackType(type: PostFeedbackType): type is SaveFeedbackType {
    return type === 'save' || type === 'unsave';
}

function applyPersistedFeedback(posts: FeedPostData[], feedbackItems: StoredPostFeedback[]): FeedPostData[] {
    const latestVoteByPost = new Map<string, VoteFeedbackType>();
    const latestSaveByPost = new Map<string, SaveFeedbackType>();

    for (const item of feedbackItems) {
        if (!latestVoteByPost.has(item.postId) && isVoteFeedbackType(item.type)) {
            latestVoteByPost.set(item.postId, item.type);
        }
        if (!latestSaveByPost.has(item.postId) && isSaveFeedbackType(item.type)) {
            latestSaveByPost.set(item.postId, item.type);
        }
    }

    return posts.map((post) => {
        const latestVote = latestVoteByPost.get(post.id);
        const latestSave = latestSaveByPost.get(post.id);

        const userVote =
            latestVote === 'upvote'
                ? 1
                : latestVote === 'downvote'
                    ? -1
                    : latestVote === 'skip'
                        ? 0
                        : (post.userVote ?? 0);
        const isSaved = latestSave === 'save' ? true : latestSave === 'unsave' ? false : Boolean(post.isSaved);

        return {
            ...post,
            userVote,
            isSaved,
        };
    });
}

function rankNovelRecommendations(
    posts: FeedPostData[],
    interactedPostIds: string[],
    topicInteractionCounts: Record<string, number>
): FeedPostData[] {
    const interactedSet = new Set(interactedPostIds);
    const unseenPosts = posts.filter((post) => !interactedSet.has(post.id));
    const maxVotes = unseenPosts.reduce((max, post) => Math.max(max, post.votes ?? 0), 1);

    return unseenPosts
        .map((post) => {
            const topicPenalty = post.topic ? (topicInteractionCounts[post.topic] ?? 0) : 0;
            const noveltyScore = 1 / (1 + topicPenalty);
            const engagementScore = (post.votes ?? 0) / maxVotes;
            const deterministicDiversityBoost = ((Number.parseInt(post.id, 10) || 1) % 7) * 0.01;
            const recommendationScore = noveltyScore * 0.72 + engagementScore * 0.23 + deterministicDiversityBoost;

            return { post, recommendationScore };
        })
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .map(({ post }) => post);
}

export function HomeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [refreshing, setRefreshing] = React.useState(false);
    const [isScrolling, setIsScrolling] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [feedHeight, setFeedHeight] = React.useState(0);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [posts, setPosts] = React.useState<FeedPostData[]>(FEED_DATA);
    const [interactedPostIds, setInteractedPostIds] = React.useState<string[]>([]);
    const [topicInteractionCounts, setTopicInteractionCounts] = React.useState<Record<string, number>>({});
    const skeletonPulse = React.useRef(new Animated.Value(0.5)).current;
    const flatListRef = React.useRef<FlatList<FeedPostData>>(null);
    const { showToast } = useToast();

    const recommendedPosts = React.useMemo(
        () => rankNovelRecommendations(posts, interactedPostIds, topicInteractionCounts),
        [posts, interactedPostIds, topicInteractionCounts]
    );

    const resolvedFeedHeight = feedHeight > 0 ? feedHeight : DEFAULT_FEED_HEIGHT;

    const onViewableItemsChanged = React.useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const visible = viewableItems[0];
        if (visible?.index != null) {
            setActiveIndex(visible.index);
        }
    }).current;

    const viewabilityConfig = React.useRef({
        itemVisiblePercentThreshold: 80,
    }).current;

    React.useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(skeletonPulse, { toValue: 0.25, duration: 550, useNativeDriver: true }),
                Animated.timing(skeletonPulse, { toValue: 0.85, duration: 550, useNativeDriver: true }),
            ])
        );

        loop.start();
        const timer = setTimeout(() => {
            setIsLoading(false);
            loop.stop();
        }, 1000);

        return () => {
            clearTimeout(timer);
            loop.stop();
        };
    }, [skeletonPulse]);

    React.useEffect(() => {
        let cancelled = false;

        const hydratePersistedFeedback = async () => {
            try {
                const feedbackItems = await listAllPostFeedback({ maxPages: 6, pageSize: 50 });
                if (cancelled || feedbackItems.length === 0) {
                    return;
                }
                setPosts((currentPosts) => applyPersistedFeedback(currentPosts, feedbackItems));
            } catch (error) {
                console.warn('[feedback] Failed to hydrate feedback:', error);
            }
        };

        void hydratePersistedFeedback();

        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        if (recommendedPosts.length === 0) {
            setActiveIndex(0);
            return;
        }

        if (activeIndex >= recommendedPosts.length) {
            const nextIndex = recommendedPosts.length - 1;
            setActiveIndex(nextIndex);
            flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
        }
    }, [activeIndex, recommendedPosts.length]);

    const handleFeedLayout = React.useCallback((event: LayoutChangeEvent) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        if (nextHeight > 0 && nextHeight !== feedHeight) {
            setFeedHeight(nextHeight);
        }
    }, [feedHeight]);

    const trackInteraction = React.useCallback((postId: string) => {
        const interactedPost = posts.find((post) => post.id === postId);

        setInteractedPostIds((current) => {
            if (current.includes(postId)) {
                return current;
            }

            if (interactedPost?.topic) {
                const topic = interactedPost.topic;
                setTopicInteractionCounts((topicCounts) => ({
                    ...topicCounts,
                    [topic]: (topicCounts[topic] ?? 0) + 1,
                }));
            }

            return [...current, postId];
        });
    }, [posts]);

    const handleResetRecommendations = React.useCallback(() => {
        setInteractedPostIds([]);
        setTopicInteractionCounts({});
        setActiveIndex(0);
        requestAnimationFrame(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => {
            if (recommendedPosts.length === 0) {
                handleResetRecommendations();
            }
            setRefreshing(false);
        }, 800);
    }, [handleResetRecommendations, recommendedPosts.length]);

    const persistPostFeedback = React.useCallback(async (postId: string, feedbackType: PostFeedbackType) => {
        try {
            await sendPostFeedback(postId, feedbackType);
        } catch (error) {
            console.warn('[feedback] Failed to persist feedback:', { postId, feedbackType, error });
            showToast({
                message: 'Could not sync action',
                type: 'error',
            });
        }
    }, [showToast]);

    const handleGoInDepth = (postId: string) => {
        const post = posts.find((candidate) => candidate.id === postId);
        if (!post) {
            return;
        }

        trackInteraction(postId);
        navigation.navigate('PostDetails', { post });
    };

    const handleUpvote = (postId: string) => {
        const post = posts.find((candidate) => candidate.id === postId);
        if (!post) return;

        const currentVote = post.userVote ?? 0;
        let newVote: VoteValue;
        let voteDelta: number;

        if (currentVote === 1) {
            newVote = 0;
            voteDelta = -1;
        } else if (currentVote === -1) {
            newVote = 1;
            voteDelta = 2;
        } else {
            newVote = 1;
            voteDelta = 1;
        }

        trackInteraction(postId);
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id !== postId) return post;

                return {
                    ...post,
                    userVote: newVote,
                    votes: (post.votes ?? 0) + voteDelta,
                };
            })
        );

        void persistPostFeedback(postId, toVoteFeedbackType(newVote));
    };

    const handleDownvote = (postId: string) => {
        const post = posts.find((candidate) => candidate.id === postId);
        if (!post) return;

        const currentVote = post.userVote ?? 0;
        let newVote: VoteValue;
        let voteDelta: number;

        if (currentVote === -1) {
            newVote = 0;
            voteDelta = 1;
        } else if (currentVote === 1) {
            newVote = -1;
            voteDelta = -2;
        } else {
            newVote = -1;
            voteDelta = -1;
        }

        trackInteraction(postId);
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id !== postId) return post;

                return {
                    ...post,
                    userVote: newVote,
                    votes: (post.votes ?? 0) + voteDelta,
                };
            })
        );

        void persistPostFeedback(postId, toVoteFeedbackType(newVote));
    };

    const handleSave = (postId: string) => {
        const post = posts.find((candidate) => candidate.id === postId);
        if (!post) {
            return;
        }
        const newIsSaved = !post.isSaved;

        trackInteraction(postId);
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id !== postId) {
                    return post;
                }
                return { ...post, isSaved: newIsSaved };
            })
        );

        if (newIsSaved) {
            showToast({
                message: 'Saved',
                type: 'save',
                actionLabel: 'View',
                onAction: () => navigation.navigate('Main', { screen: 'Saved' } as any),
            });
        } else {
            showToast({
                message: 'Removed from saved',
                type: 'unsave',
            });
        }

        void persistPostFeedback(postId, newIsSaved ? 'save' : 'unsave');
    };

    const handleShare = (postId: string) => {
        trackInteraction(postId);
        console.log('Share post:', postId);
    };

    const renderSkeleton = () => (
        <FlatList
            style={styles.container}
            data={[1, 2]}
            keyExtractor={(item) => `skeleton-${item}`}
            pagingEnabled
            renderItem={() => (
                <View style={[styles.slideWrapper, { height: resolvedFeedHeight }]}>
                    <Animated.View style={[styles.skeletonCard, { opacity: skeletonPulse }]}>
                        <View style={styles.skeletonMeta} />
                        <View style={styles.skeletonImage} />
                        <View style={styles.skeletonCaptionShort} />
                        <View style={styles.skeletonCaptionLong} />
                    </Animated.View>
                </View>
            )}
            showsVerticalScrollIndicator={false}
        />
    );

    if (isLoading) {
        return (
            <View style={styles.container} onLayout={handleFeedLayout}>
                {renderSkeleton()}
            </View>
        );
    }

    return (
        <View style={styles.container} onLayout={handleFeedLayout}>
            <FlatList
                ref={flatListRef}
                data={recommendedPosts}
                keyExtractor={(item) => item.id}
                pagingEnabled
                snapToAlignment="start"
                snapToInterval={resolvedFeedHeight}
                decelerationRate="fast"
                disableIntervalMomentum
                renderItem={({ item }) => (
                    <View style={[styles.slideWrapper, { height: resolvedFeedHeight }]}>
                        <FeedPostCard
                            post={item}
                            variant="slide"
                            slideHeight={resolvedFeedHeight}
                            onUpvote={handleUpvote}
                            onDownvote={handleDownvote}
                            onSave={handleSave}
                            onShare={handleShare}
                            onGoInDepth={handleGoInDepth}
                            isMenuForceClose={isScrolling}
                        />
                    </View>
                )}
                getItemLayout={(_, index) => ({
                    length: resolvedFeedHeight,
                    offset: resolvedFeedHeight * index,
                    index,
                })}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={() => setIsScrolling(true)}
                onScrollEndDrag={() => setIsScrolling(false)}
                onMomentumScrollEnd={() => setIsScrolling(false)}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.white}
                    />
                }
                ListEmptyComponent={
                    <View style={[styles.emptyState, { height: resolvedFeedHeight }]}>
                        <Text style={styles.emptyTitle}>No unseen posts right now</Text>
                        <Text style={styles.emptySubtitle}>
                            We hide anything you already interacted with. Reset to see them again.
                        </Text>
                        <TouchableOpacity style={styles.resetButton} onPress={handleResetRecommendations}>
                            <Text style={styles.resetButtonText}>Reset recommendations</Text>
                        </TouchableOpacity>
                    </View>
                }
            />

            <View pointerEvents="none" style={styles.feedPill}>
                <Text style={styles.feedPillText}>For You</Text>
            </View>

            {recommendedPosts.length > 0 && (
                <View pointerEvents="none" style={styles.indexPill}>
                    <Text style={styles.indexPillText}>
                        {Math.min(activeIndex + 1, recommendedPosts.length)}/{recommendedPosts.length}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    slideWrapper: {
        backgroundColor: '#020617',
    },
    feedPill: {
        position: 'absolute',
        top: 12,
        left: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.66)',
        borderWidth: 1,
        borderColor: 'rgba(203, 213, 225, 0.35)',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    feedPillText: {
        color: colors.white,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    indexPill: {
        position: 'absolute',
        top: 12,
        right: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.66)',
        borderWidth: 1,
        borderColor: 'rgba(203, 213, 225, 0.35)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    indexPillText: {
        color: '#E2E8F0',
        fontSize: 12,
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyTitle: {
        color: colors.white,
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtitle: {
        color: '#CBD5E1',
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 18,
    },
    resetButton: {
        borderWidth: 1,
        borderColor: 'rgba(203, 213, 225, 0.55)',
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
    },
    resetButtonText: {
        color: colors.white,
        fontSize: 13,
        fontWeight: '700',
    },
    skeletonCard: {
        marginHorizontal: 10,
        marginVertical: 8,
        borderRadius: 22,
        backgroundColor: '#0F172A',
        paddingHorizontal: 16,
        paddingVertical: 14,
        flex: 1,
    },
    skeletonMeta: {
        width: 140,
        height: 22,
        borderRadius: 999,
        backgroundColor: '#1E293B',
        marginBottom: 14,
    },
    skeletonImage: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: '#1E293B',
        marginBottom: 14,
    },
    skeletonCaptionShort: {
        width: '60%',
        height: 10,
        borderRadius: 8,
        backgroundColor: '#334155',
        marginBottom: 8,
    },
    skeletonCaptionLong: {
        width: '85%',
        height: 10,
        borderRadius: 8,
        backgroundColor: '#334155',
    },
});
