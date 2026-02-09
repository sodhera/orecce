import React from 'react';
import { StyleSheet, View, FlatList, RefreshControl, Animated } from 'react-native';
import { FeedPostCard, FeedPostData, CategoryList } from '../components';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useToast } from '../context/ToastContext';

// Placeholder feed data with sample images
// Using picsum.photos for placeholder images
const FEED_DATA: FeedPostData[] = [
    {
        id: '1',
        type: 'image',
        images: [
            require('../../assets/images/post_1.png'),
        ],
        topic: 'AI Agents',
        caption: 'Codex released an App on Mac. You can now run agents parallely within the same app window.  They’re also giving 2x tokens for a limited time. Skills and automation allows users to connect tools to their codex app, which is an opportunity for Orecce integration.',
        votes: 248,
        userVote: 0,
        isSaved: false,
        date: 'Jan 27, 2026',
    },
    // {
    //     id: '6',
    //     type: 'text',
    //     topic: 'Thoughts',
    //     content: 'This is a text-only post to test the new functionality. It should not display any image placeholder. The text is long enough to demonstrate line wrapping and potential truncation if it exceeds the limit. We want to ensure that the layout remains stable and looks good even without visual media attached. #textonly #update',
    //     votes: 12,
    //     userVote: 0,
    //     isSaved: false,
    //     date: 'Jan 22, 2026',
    // },
    {
        id: '2',
        type: 'image',
        images: [require('../../assets/images/post_2.png')],
        topic: 'Venture Capital',
        caption: 'QIA expanded its venture capital programme to $3B from $1B and introduced a new 10 year residency program for entrepreneurs.',
        votes: 89,
        userVote: 1, // Already upvoted
        isSaved: false,
        date: 'Jan 26, 2026',
    },
    {
        id: '3',
        type: 'image',
        images: [require('../../assets/images/post_3.png')],
        topic: 'Startups',
        caption: 'Y Combinator released requests for startups including “AI-Native Agencies” - a category that Orecce might fall into. Other categories include Cursor for product managers, AI-native hedge funds, Stablecoin Financial Services, AI for government, Modern metal mills, AI guidance for physical work',
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
    // {
    //     id: '5',
    //     type: 'image',
    //     images: [
    //         'https://picsum.photos/seed/post5a/800/800',
    //         'https://picsum.photos/seed/post5b/800/800',
    //         'https://picsum.photos/seed/post5c/800/800',
    //         'https://picsum.photos/seed/post5d/800/800',
    //     ],
    //     topic: 'Photography',
    //     caption: 'Urban photography walk through downtown 📸',
    //     votes: 567,
    //     userVote: 0,
    //     isSaved: false,
    //     date: 'Jan 23, 2026',
    // },
];

export function HomeScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [refreshing, setRefreshing] = React.useState(false);
    const [posts, setPosts] = React.useState<FeedPostData[]>(FEED_DATA);
    const [isScrolling, setIsScrolling] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const skeletonPulse = React.useRef(new Animated.Value(0.6)).current;

    React.useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(skeletonPulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
                Animated.timing(skeletonPulse, { toValue: 0.9, duration: 500, useNativeDriver: true }),
            ])
        );
        loop.start();

        const timer = setTimeout(() => {
            setIsLoading(false);
            loop.stop();
        }, 2000);

        return () => {
            loop.stop();
            clearTimeout(timer);
        };
    }, [skeletonPulse]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // Simulate refresh
        setTimeout(() => setRefreshing(false), 1500);
    }, []);

    const handleGoInDepth = (postId: string) => {
        const post = posts.find((p) => p.id === postId);
        if (post) {
            navigation.navigate('PostDetails', { post });
        }
    };

    const handleUpvote = (postId: string) => {
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id !== postId) return post;

                const currentVote = post.userVote ?? 0;
                let newVote: -1 | 0 | 1;
                let voteDelta: number;

                if (currentVote === 1) {
                    // Already upvoted, remove upvote
                    newVote = 0;
                    voteDelta = -1;
                } else if (currentVote === -1) {
                    // Was downvoted, switch to upvote (+2 total)
                    newVote = 1;
                    voteDelta = 2;
                } else {
                    // No vote, add upvote
                    newVote = 1;
                    voteDelta = 1;
                }

                return {
                    ...post,
                    userVote: newVote,
                    votes: (post.votes ?? 0) + voteDelta,
                };
            })
        );
    };

    const handleDownvote = (postId: string) => {
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id !== postId) return post;

                const currentVote = post.userVote ?? 0;
                let newVote: -1 | 0 | 1;
                let voteDelta: number;

                if (currentVote === -1) {
                    // Already downvoted, remove downvote
                    newVote = 0;
                    voteDelta = 1;
                } else if (currentVote === 1) {
                    // Was upvoted, switch to downvote (-2 total)
                    newVote = -1;
                    voteDelta = -2;
                } else {
                    // No vote, add downvote
                    newVote = -1;
                    voteDelta = -1;
                }

                return {
                    ...post,
                    userVote: newVote,
                    votes: (post.votes ?? 0) + voteDelta,
                };
            })
        );
    };

    const { showToast } = useToast();

    const handleSave = (postId: string) => {
        setPosts((currentPosts) =>
            currentPosts.map((post) => {
                if (post.id === postId) {
                    const newIsSaved = !post.isSaved;

                    // Show toast
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

                    return { ...post, isSaved: newIsSaved };
                }
                return post;
            })
        );
    };

    const handleShare = (postId: string) => {
        console.log('Share post:', postId);
        // TODO: Implement share functionality
    };

    const handleTopicPress = (postId: string) => {
        console.log('Topic pressed for post:', postId);
        // TODO: Navigate to topic feed
    };

    if (isLoading) {
        const skeletonItems = [1, 2, 3];
        return (
            <FlatList
                style={styles.container}
                contentContainerStyle={styles.contentContainer}
                data={skeletonItems}
                keyExtractor={(item) => `skeleton-${item}`}
                ListHeaderComponent={<CategoryList />}
                renderItem={() => (
                    <Animated.View style={[styles.skeletonCard, { opacity: skeletonPulse }]}>
                        <View style={styles.skeletonHeader} />
                        <View style={styles.skeletonImage} />
                        <View style={styles.skeletonTextShort} />
                        <View style={styles.skeletonTextLong} />
                    </Animated.View>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                showsVerticalScrollIndicator={false}
            />
        );
    }

    return (
        <FlatList
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            ListHeaderComponent={<CategoryList />}
            data={posts}
            renderItem={({ item }) => (
                <FeedPostCard
                    post={item}
                    onUpvote={handleUpvote}
                    onDownvote={handleDownvote}
                    onSave={handleSave}
                    onShare={handleShare}
                    onPress={handleTopicPress}
                    onGoInDepth={handleGoInDepth}
                    isMenuForceClose={isScrolling}
                />
            )}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => setIsScrolling(true)}
            onScrollEndDrag={() => setIsScrolling(false)}
            onMomentumScrollEnd={() => setIsScrolling(false)}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.primary}
                />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    contentContainer: {
        paddingTop: 8,
        paddingBottom: 16,
    },
    separator: {
        height: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.surface,
    },
    skeletonCard: {
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
    },
    skeletonHeader: {
        width: 140,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.surface,
        marginBottom: 12,
    },
    skeletonImage: {
        height: 200,
        borderRadius: 12,
        backgroundColor: colors.surface,
        marginBottom: 12,
    },
    skeletonTextShort: {
        width: '40%',
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.surface,
        marginBottom: 8,
    },
    skeletonTextLong: {
        width: '75%',
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.surface,
    },
});
