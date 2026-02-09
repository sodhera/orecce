import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    Image,
    Dimensions,
    Linking
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { ScreenHeader } from '../components';
import { RootStackParamList } from '../navigation/RootNavigator';

type RssArticleRouteProp = RouteProp<RootStackParamList, 'RssArticle'>;

const { width } = Dimensions.get('window');

export function RssArticleScreen() {
    const navigation = useNavigation();
    const route = useRoute<RssArticleRouteProp>();

    // Default values provided for safety
    const {
        title,
        summary,
        link,
        date,
        imageUrl,
        source
    } = route.params;

    const handleReadFullArticle = async () => {
        try {
            const supported = await Linking.canOpenURL(link);
            if (supported) {
                await Linking.openURL(link);
            } else {
                console.warn(`Don't know how to open this URL: ${link}`);
            }
        } catch (error) {
            console.error('An error occurred', error);
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    };

    // Strip HTML tags from summary if present
    const cleanSummary = summary ? summary.replace(/<[^>]*>/g, '').trim() : '';

    return (
        <View style={styles.container}>
            <ScreenHeader title="Article Preview" onClose={() => navigation.goBack()} />

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {imageUrl && (
                    <Image
                        source={{ uri: imageUrl }}
                        style={styles.image}
                        resizeMode="cover"
                    />
                )}

                <View style={styles.articleBody}>
                    <Text style={styles.source}>{source}</Text>
                    <Text style={styles.title}>{title}</Text>

                    {date && (
                        <View style={styles.metaRow}>
                            <Ionicons name="time-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                            <Text style={styles.date}>{formatDate(date)}</Text>
                        </View>
                    )}

                    <View style={styles.divider} />

                    {cleanSummary ? (
                        <Text style={styles.summary}>{cleanSummary}</Text>
                    ) : (
                        <Text style={styles.emptySummary}>
                            No preview available. Tap below to read the full article.
                        </Text>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity style={styles.readButton} onPress={handleReadFullArticle}>
                    <Text style={styles.readButtonText}>Read Full Article</Text>
                    <Ionicons name="open-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
            </View>
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
    contentContainer: {
        paddingBottom: 100, // Space for footer
    },
    image: {
        width: width,
        height: 240,
        backgroundColor: colors.border,
    },
    articleBody: {
        padding: 20,
    },
    source: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        textTransform: 'uppercase',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
        lineHeight: 32,
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    date: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 16,
    },
    summary: {
        fontSize: 16,
        color: colors.textPrimary,
        lineHeight: 26,
    },
    emptySummary: {
        fontSize: 16,
        color: colors.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 20,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    readButton: {
        backgroundColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    readButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
