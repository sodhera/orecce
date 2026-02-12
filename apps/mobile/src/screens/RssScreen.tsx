import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { ScreenHeader } from '../components';
import { API_ENDPOINTS } from '../config/api';

interface NewsItem {
    id: string;
    sourceName: string;
    title: string;
    link: string;
    date?: string;
    summary?: string;
    fullText?: string;
    fullTextStatus?: string;
}

export function RssScreen() {
    const navigation = useNavigation();
    const [items, setItems] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchLatestNews();
    }, []);

    const fetchLatestNews = async () => {
        try {
            setLoading(true);
            setError(null);

            const { auth } = require('../config/firebase');
            if (!auth.currentUser) {
                throw new Error('You must be signed in to view news');
            }
            const token = await auth.currentUser.getIdToken();

            const response = await fetch(`${API_ENDPOINTS.NEWS_ARTICLES}?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch latest news: ${response.status}`);
            }

            const payload = await response.json();
            const apiItems = payload?.data?.items || [];
            const mapped: NewsItem[] = apiItems.map((item: any) => ({
                id: String(item.id),
                sourceName: String(item.sourceName || 'News'),
                title: String(item.title || ''),
                link: String(item.canonicalUrl || ''),
                date:
                    typeof item.publishedAtMs === 'number'
                        ? new Date(item.publishedAtMs).toISOString()
                        : undefined,
                summary: typeof item.summary === 'string' ? item.summary : '',
                fullText: typeof item.fullText === 'string' ? item.fullText : undefined,
                fullTextStatus: item.fullTextStatus ? String(item.fullTextStatus) : undefined,
            }));
            setItems(mapped);
        } catch (err) {
            console.error('Error fetching latest news:', err);
            setError(err instanceof Error ? err.message : 'Failed to load latest news');
        } finally {
            setLoading(false);
        }
    };

    const handleItemPress = (item: NewsItem) => {
        // @ts-ignore - navigation types need update
        navigation.navigate('RssArticle', {
            title: item.title,
            summary: item.summary,
            fullText: item.fullText,
            link: item.link,
            date: item.date,
            source: item.sourceName,
            articleId: item.id,
        });
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return dateString;
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ScreenHeader title="Latest News" onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading latest news...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <ScreenHeader title="Latest News" onClose={() => navigation.goBack()} />
                <View style={styles.centerContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
                    <Text style={styles.errorTitle}>Failed to Load News</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={fetchLatestNews}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader title="Latest News" onClose={() => navigation.goBack()} />
            <FlatList
                data={items}
                keyExtractor={(item, index) => item.id || item.link || String(index)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.itemContainer} onPress={() => handleItemPress(item)}>
                        <View style={styles.itemContent}>
                            <Text style={styles.sourceName}>{item.sourceName}</Text>
                            <Text style={styles.itemTitle}>{item.title}</Text>
                            <View style={styles.metaContainer}>
                                <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
                                {item.fullTextStatus === 'ready' ? (
                                    <Text style={styles.fullTextReady}>Full text</Text>
                                ) : null}
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
                        <Text style={styles.emptyText}>No recent news found.</Text>
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
    itemContent: {
        flex: 1,
        padding: 12,
    },
    sourceName: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 6,
        textTransform: 'uppercase',
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
    fullTextReady: {
        fontSize: 11,
        color: colors.primary,
        fontWeight: '600',
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
    },
});
