import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/colors';

export interface CollectionData {
    id: string;
    name: string;
    postCount: number;
    thumbnailUrl?: string;
}

interface CollectionCardProps {
    collection: CollectionData;
    onPress?: (collection: CollectionData) => void;
}

/**
 * Spotify-style collection card for the Saved screen.
 * Displays a thumbnail, collection name, post count, and navigation chevron.
 */
export function CollectionCard({ collection, onPress }: CollectionCardProps) {
    return (
        <TouchableOpacity
            style={styles.container}
            onPress={() => onPress?.(collection)}
            activeOpacity={0.7}
        >
            {/* Thumbnail */}
            <View style={styles.thumbnail}>
                <Ionicons name="bookmark" size={24} color={colors.textPrimary} />
            </View>

            {/* Text Content */}
            <View style={styles.textContainer}>
                <Text style={styles.name} numberOfLines={1}>
                    {collection.name}
                </Text>
                <Text style={styles.postCount}>
                    {collection.postCount} {collection.postCount === 1 ? 'post' : 'posts'}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    thumbnail: {
        width: 56,
        height: 56,
        borderRadius: 4,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    name: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    postCount: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});
