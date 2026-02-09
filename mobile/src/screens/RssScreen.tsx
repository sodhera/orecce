import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    SectionList,
    Linking,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/colors';
import { ScreenHeader } from '../components';
import { API_ENDPOINTS } from '../config/api';

interface RssFeedConfig {
    id: string;
    name: string;
    url: string;
    group?: string;
}

interface FeedGroup {
    title: string;
    data: RssFeedConfig[];
    expanded: boolean;
}

export function RssScreen() {
    const navigation = useNavigation();
    const [feeds, setFeeds] = useState<RssFeedConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchFeeds();
    }, []);

    const fetchFeeds = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get Firebase auth token
            const { auth } = require('../config/firebase');
            if (!auth.currentUser) {
                throw new Error('You must be signed in to view RSS feeds');
            }

            const token = await auth.currentUser.getIdToken();

            const response = await fetch(API_ENDPOINTS.RSS_FEEDS, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch feeds: ${response.status}`);
            }

            const data = await response.json();
            setFeeds(data.feeds || []);
        } catch (err) {
            console.error('Error fetching RSS feeds:', err);
            setError(err instanceof Error ? err.message : 'Failed to load RSS feeds');
        } finally {
            setLoading(false);
        }
    };

    // Group feeds by category
    const groupedFeeds = React.useMemo(() => {
        const groups = new Map<string, RssFeedConfig[]>();

        feeds.forEach((feed) => {
            const group = feed.group || 'Other';
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group)!.push(feed);
        });

        // Convert to array and sort alphabetically
        return Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([title, data]) => ({
                title,
                data,
                expanded: expandedGroups.has(title),
            }));
    }, [feeds, expandedGroups]);

    const toggleGroup = (groupTitle: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupTitle)) {
                next.delete(groupTitle);
            } else {
                next.add(groupTitle);
            }
            return next;
        });
    };

    const handleFeedPress = async (feed: RssFeedConfig) => {
        // Navigate to the detail screen to show feed items
        // @ts-ignore - navigation types need update
        navigation.navigate('RssFeedDetail', {
            feedId: feed.id,
            feedName: feed.name
        });
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ScreenHeader title="RSS Feeds" onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading feeds...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <ScreenHeader title="RSS Feeds" onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
                    <Text style={styles.errorTitle}>Failed to Load Feeds</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={fetchFeeds}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader title="RSS Feeds" onClose={() => navigation.goBack()} />

            <ScrollView style={styles.content}>
                {groupedFeeds.map((group) => (
                    <View key={group.title} style={styles.groupContainer}>
                        <TouchableOpacity
                            style={styles.groupHeader}
                            onPress={() => toggleGroup(group.title)}
                        >
                            <Ionicons
                                name={group.expanded ? 'chevron-down' : 'chevron-forward'}
                                size={20}
                                color={colors.textSecondary}
                                style={styles.groupIcon}
                            />
                            <Text style={styles.groupTitle}>{group.title}</Text>
                            <View style={styles.groupBadge}>
                                <Text style={styles.groupCount}>{group.data.length}</Text>
                            </View>
                        </TouchableOpacity>

                        {group.expanded && (
                            <View style={styles.feedList}>
                                {group.data.map((feed) => (
                                    <TouchableOpacity
                                        key={feed.id}
                                        style={styles.feedItem}
                                        onPress={() => handleFeedPress(feed)}
                                    >
                                        <Ionicons
                                            name="logo-rss"
                                            size={18}
                                            color={colors.textMuted}
                                            style={styles.feedIcon}
                                        />
                                        <Text style={styles.feedName}>{feed.name}</Text>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={16}
                                            color={colors.textMuted}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                ))}

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        {feeds.length} feeds across {groupedFeeds.length} categories
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: colors.textSecondary,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    errorText: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 20,
    },
    retryButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    groupContainer: {
        marginBottom: 4,
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: colors.background,
    },
    groupIcon: {
        marginRight: 8,
    },
    groupTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    groupBadge: {
        backgroundColor: colors.border,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    groupCount: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    feedList: {
        backgroundColor: colors.background,
    },
    feedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        paddingLeft: 44,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    feedIcon: {
        marginRight: 12,
    },
    feedName: {
        flex: 1,
        fontSize: 15,
        color: colors.textPrimary,
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 13,
        color: colors.textMuted,
    },
});
