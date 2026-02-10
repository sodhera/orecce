import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Animated, Dimensions } from 'react-native';
import { colors } from '../styles/colors';

interface BottomSheetMenuProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function BottomSheetMenu({ visible, onClose, children }: BottomSheetMenuProps) {
    // Local state to keep Modal mounted while animating out
    const [modalVisible, setModalVisible] = useState(visible);

    const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            // Reset values
            slideAnim.setValue(Dimensions.get('window').height);
            fadeAnim.setValue(0);

            // Animate In
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Animate Out
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: Dimensions.get('window').height,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setModalVisible(false);
                onClose(); // Ensure parent state is synced if not already
            });
        }
    }, [visible]);

    if (!modalVisible) return null;

    return (
        <Modal
            transparent={true}
            visible={modalVisible}
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                {/* Visual Backdrop (Fade) */}
                <Animated.View
                    style={[
                        styles.backdrop,
                        { opacity: fadeAnim }
                    ]}
                />

                {/* Touch Overlay (for closing) */}
                <Pressable
                    style={styles.menuOverlay}
                    onPress={onClose}
                >
                    {/* Bottom Sheet Content (Slide) */}
                    <Animated.View style={[
                        styles.bottomSheet,
                        { transform: [{ translateY: slideAnim }] }
                    ]}>
                        <View style={styles.bottomSheetHandle} />
                        {/* Stop propagation of touches on the content itself */}
                        <Pressable>
                            {children}
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        zIndex: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    menuOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    bottomSheet: {
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
        paddingTop: 12,
        width: '100%',
    },
    bottomSheetHandle: {
        width: 40,
        height: 4,
        backgroundColor: colors.surface,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
});
