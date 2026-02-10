import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, Image, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedPostCard, FeedPostData } from '../components/FeedPostCard';
import { BottomSheetMenu } from '../components/BottomSheetMenu';
import { colors } from '../styles/colors';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useToast } from '../context/ToastContext';

type PostDetailsScreenRouteProp = RouteProp<RootStackParamList, 'PostDetails'>;

export function PostDetailsScreen() {
    const route = useRoute<PostDetailsScreenRouteProp>();
    const navigation = useNavigation();
    const { post } = route.params;
    const [currentPost, setCurrentPost] = useState(post);
    const [menuVisible, setMenuVisible] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const [messages, setMessages] = useState<
        Array<{ id: string; text: string; sender: 'user' | 'assistant'; status?: 'loading' | 'typing' | 'done' }>
    >([]);
    const [areSourcesExpanded, setAreSourcesExpanded] = useState(true);
    const scrollRef = useRef<ScrollView | null>(null);
    const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const loadingDotsIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [loadingDots, setLoadingDots] = useState('.');
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleBack = () => {
        navigation.goBack();
    };

    const handleShare = () => {
        console.log('Share post:', currentPost.id);
        setMenuVisible(false);
    };

    const handleSave = () => {
        const newIsSaved = !currentPost.isSaved;

        // Update local state
        setCurrentPost(prev => ({ ...prev, isSaved: newIsSaved }));

        // Show toast
        if (newIsSaved) {
            showToast({
                message: 'Saved',
                type: 'save',
                actionLabel: 'View',
                onAction: () => (navigation as any).navigate('Main', { screen: 'Saved' }),
            });
        } else {
            showToast({
                message: 'Removed from saved',
                type: 'unsave',
            });
        }

        setMenuVisible(false);
    };

    const handleUpvote = () => {
        setCurrentPost((prev) => {
            const currentVote = prev.userVote ?? 0;
            let newVote: -1 | 0 | 1;
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

            return {
                ...prev,
                userVote: newVote,
                votes: (prev.votes ?? 0) + voteDelta,
            };
        });
    };

    const handleDownvote = () => {
        setCurrentPost((prev) => {
            const currentVote = prev.userVote ?? 0;
            let newVote: -1 | 0 | 1;
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

            return {
                ...prev,
                userVote: newVote,
                votes: (prev.votes ?? 0) + voteDelta,
            };
        });
    };

    const handleSendMessage = () => {
        const text = chatMessage.trim();
        if (!text) return;

        const userId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const assistantId = `${userId}-assistant`;
        const assistantText =
            "In YC’s Spring 2026 requests, they’re explicitly asking for startups that use AI beyond software—AI that helps with real, physical work—because so much of it is still inefficient, and modern AI finally makes improving it cheap and practical.\n\nI can go more in-depth if you'd like.";

        // Append user message
        setMessages((prev) => [
            ...prev,
            { id: userId, text, sender: 'user', status: 'done' },
            { id: assistantId, text: '...', sender: 'assistant', status: 'loading' },
        ]);
        setChatMessage('');
        Keyboard.dismiss();
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

        // Clear any in-flight timers
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
        if (loadingDotsIntervalRef.current) clearInterval(loadingDotsIntervalRef.current);

        // Loading indicator, then typewriter
        loadingTimeoutRef.current = setTimeout(() => {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantId ? { ...m, text: '', status: 'typing' } : m
                )
            );

            let idx = 0;
            typingIntervalRef.current = setInterval(() => {
                idx += 1;
                const nextText = assistantText.slice(0, idx);

                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {
                                ...m,
                                text: nextText,
                                status: idx >= assistantText.length ? 'done' : 'typing',
                            }
                            : m
                    )
                );

                if (idx >= assistantText.length) {
                    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
                    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
                }
            }, 25);
        }, 2000);
    };

    // Animated loading dots while any assistant message is in loading state
    useEffect(() => {
        const hasLoading = messages.some((m) => m.status === 'loading');

        if (hasLoading) {
            if (loadingDotsIntervalRef.current) clearInterval(loadingDotsIntervalRef.current);
            loadingDotsIntervalRef.current = setInterval(() => {
                setLoadingDots((prev) => (prev.length === 3 ? '.' : prev + '.'));
            }, 400);
        } else {
            if (loadingDotsIntervalRef.current) clearInterval(loadingDotsIntervalRef.current);
            setLoadingDots('.');
        }

        return () => {
            if (loadingDotsIntervalRef.current) clearInterval(loadingDotsIntervalRef.current);
        };
    }, [messages]);

    const chatBarBottomPadding = isKeyboardVisible ? 8 : insets.bottom + 8;

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
        >
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{currentPost.topic || 'Post'}</Text>

                    <View style={{ position: 'relative', zIndex: 20 }}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => setMenuVisible(!menuVisible)}
                        >
                            <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>

                        <BottomSheetMenu
                            visible={menuVisible}
                            onClose={() => setMenuVisible(false)}
                        >
                            <TouchableOpacity
                                style={styles.bottomSheetItem}
                                onPress={handleShare}
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
                                onPress={handleSave}
                                activeOpacity={0.7}
                            >
                                <View style={styles.iconContainer}>
                                    <Ionicons
                                        name={currentPost.isSaved ? 'bookmark' : 'bookmark-outline'}
                                        size={24}
                                        color={currentPost.isSaved ? colors.primary : colors.textPrimary}
                                    />
                                </View>
                                <Text style={[styles.bottomSheetItemText, currentPost.isSaved && styles.menuItemTextSaved]}>
                                    {currentPost.isSaved ? 'Remove from Saved' : 'Save'}
                                </Text>
                            </TouchableOpacity>
                        </BottomSheetMenu>
                    </View>
                </View>

                <View style={styles.body}>
                    <ScrollView
                        style={{ flex: 1 }}
                        ref={scrollRef}
                        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
                        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    >
                        <FeedPostCard
                            post={currentPost}
                            showFullContent={true}
                            detailsMode={true}
                            onUpvote={handleUpvote}
                            onDownvote={handleDownvote}
                            onSave={handleSave}
                        />
                        <View style={styles.separatorContainer}>
                            <View style={styles.line} />
                            <TouchableOpacity
                                style={styles.sourcesContainer}
                                activeOpacity={0.7}
                                onPress={() => setAreSourcesExpanded((prev) => !prev)}
                            >
                                <Text style={styles.sourcesText}>Sources</Text>
                                <Ionicons
                                    name={areSourcesExpanded ? 'chevron-up' : 'chevron-down'}
                                    size={14}
                                    color={colors.textSecondary}
                                    style={styles.chevron}
                                />
                            </TouchableOpacity>
                            <View style={styles.line} />
                        </View>

                        {/* Sources List */}
                        {areSourcesExpanded && currentPost.sources && currentPost.sources.length > 0 && (
                            <View style={styles.sourcesList}>
                                {currentPost.sources.map((source) => (
                                    <TouchableOpacity
                                        key={source.id}
                                        style={styles.sourceItem}
                                        onPress={() => console.log('Open URL:', source.url)}
                                        activeOpacity={0.7}
                                    >
                                        {source.imageUrl && (
                                            <Image
                                                source={{ uri: source.imageUrl }}
                                                style={styles.sourceImage}
                                            />
                                        )}
                                        <View style={styles.sourceContent}>
                                            <Text style={styles.sourceTitle} numberOfLines={2}>
                                                {source.title}
                                            </Text>
                                            {source.sourceName && (
                                                <Text style={styles.sourceName}>{source.sourceName}</Text>
                                            )}
                                        </View>
                                        <Ionicons name="open-outline" size={20} color={colors.textMuted} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Chat thread (user messages only for now) */}
                        {messages.length > 0 && (
                            <View style={styles.messagesContainer}>
                                {messages.map((msg) => (
                                    <View
                                        key={msg.id}
                                        style={[
                                            styles.messageBubble,
                                            msg.sender === 'user' ? styles.messageUser : styles.messageOrecce,
                                        ]}
                                    >
                                        <Text style={styles.messageText}>
                                            {msg.status === 'loading' ? loadingDots : msg.text}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    <View style={[styles.chatBarSpacer, { paddingBottom: chatBarBottomPadding }]}>
                        <View style={styles.chatInputWrapper}>
                            <TextInput
                                style={styles.chatInput}
                                placeholder="Ask about this post..."
                                placeholderTextColor={colors.textMuted}
                                value={chatMessage}
                                onChangeText={setChatMessage}
                                multiline
                            />
                            <TouchableOpacity
                                style={styles.chatSendButton}
                                onPress={handleSendMessage}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="send" size={18} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.surface,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    content: {
        paddingTop: 16,
        paddingBottom: 24,
    },
    body: {
        flex: 1,
    },
    separatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
        marginHorizontal: 16,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: colors.surface,
    },
    sourcesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    sourcesText: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    chevron: {
        marginLeft: 4,
        marginTop: 2,
    },
    sourcesList: {
        paddingHorizontal: 16,
    },
    sourceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.surface,
    },
    sourceImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        marginRight: 12,
        backgroundColor: colors.surface,
    },
    sourceContent: {
        flex: 1,
        marginRight: 12,
    },
    sourceTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textPrimary,
        marginBottom: 4,
        lineHeight: 22,
    },
    sourceName: {
        fontSize: 13,
        color: colors.textMuted,
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
    chatBarSpacer: {
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    chatInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.surface,
        backgroundColor: colors.backgroundLight,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    chatInput: {
        flex: 1,
        minHeight: 36,
        maxHeight: 140,
        paddingVertical: 6,
        paddingHorizontal: 0,
        color: colors.textPrimary,
        textAlignVertical: 'top',
        fontSize: 14,
        lineHeight: 20,
    },
    chatSendButton: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginLeft: 6,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    messagesContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 10,
    },
    messageBubble: {
        maxWidth: '80%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: colors.backgroundLight,
    },
    messageUser: {
        alignSelf: 'flex-end',
        backgroundColor: colors.backgroundLight,
        borderWidth: 1,
        borderColor: colors.surface,
    },
    messageOrecce: {
        alignSelf: 'flex-start',
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderRadius: 0,
        borderWidth: 0,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 20,
        color: colors.textPrimary,
    },
});
