import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Image
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { ScreenHeader } from '../components';
import { API_ENDPOINTS } from '../config/api';
import { RootStackParamList } from '../navigation/RootNavigator';

interface RssItem {
    id?: string;
    title: string;
    link: string;
    date?: string;
    summary?: string;
    imageUrl?: string;
}

interface RssFeedData {
    title: string;
    items: RssItem[];
}

type RssFeedDetailRouteProp = RouteProp<RootStackParamList, 'RssFeedDetail'>;

export function RssFeedDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute<RssFeedDetailRouteProp>();
    const { feedId, feedName } = route.params;

    const [items, setItems] = useState<RssItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchFeedItems();
    }, []);

    const fetchFeedItems = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get Firebase auth token
            const { auth } = require('../config/firebase');
            if (!auth.currentUser) {
                throw new Error('You must be signed in to view RSS feeds');
            }
            const token = await auth.currentUser.getIdToken();

            const url = `${API_ENDPOINTS.RSS_FEED}?id=${encodeURIComponent(feedId)}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch feed: ${response.status}`);
            }

            const data = await response.json();
            console.log('DEBUG First Item:', data.items?.[0]); // Check if imageUrl exists
            setItems(data.items || []);
        } catch (err) {
            console.error('Error fetching RSS feed items:', err);
            setError(err instanceof Error ? err.message : 'Failed to load feed items');
        } finally {
            setLoading(false);
        }
    };

    const handleItemPress = (item: RssItem) => {
        // @ts-ignore - navigation types need update
        navigation.navigate('RssArticle', {
            title: item.title,
            summary: item.summary,
            link: item.link,
            date: item.date,
            imageUrl: item.imageUrl,
            source: feedName
        });
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ScreenHeader title={feedName} onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading articles...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <ScreenHeader title={feedName} onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
                    <Text style={styles.errorTitle}>Failed to Load</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={fetchFeedItems}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader title={feedName} onClose={() => navigation.goBack()} />

            <FlatList
                data={items}
                keyExtractor={(item, index) => item.id || item.link || String(index)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.itemContainer}
                        onPress={() => handleItemPress(item)}
                    >
                        {item.imageUrl && (
                            <Image
                                source={{ uri: item.imageUrl }}
                                style={styles.itemImage}
                                resizeMode="cover"
                            />
                        )}
                        <View style={styles.itemContent}>
                            <Text style={styles.itemTitle}>{item.title}</Text>
                            <View style={styles.metaContainer}>
                                <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
                            </View>
                            {item.summary ? (
                                <Text style={styles.itemSummary} numberOfLines={3}>
                                    {item.summary.replace(/<[^>]*>/g, '').trim()}
                                </Text>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.centerContainer}>
                        <Text style={styles.emptyText}>No articles found in this feed.</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    listContent: {
        padding: 16,
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
    itemContainer: {
        backgroundColor: colors.background,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        flexDirection: 'row',
    },
    itemImage: {
        width: 100,
        height: '100%',
        backgroundColor: colors.border,
    },
    itemContent: {
        flex: 1,
        padding: 12,
    },
    itemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
        lineHeight: 20,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    itemDate: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    itemSummary: {
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    emptyText: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
    }
});
