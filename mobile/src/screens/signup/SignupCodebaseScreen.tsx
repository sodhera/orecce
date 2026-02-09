import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
    LayoutAnimation,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { SignupStepLayout } from './SignupStepLayout';
import { colors } from '../../styles/colors';

type SignupStackParamList = {
    SignupAuth: { onCancel: () => void };
    SignupConnect: { email: string; onCancel: () => void };
    SignupName: { email: string; authMethod: 'email' | 'google' | 'apple' };
    SignupPreferences: { email: string; name: string };
    SignupCodebase: { email: string; name: string; preferences: string };
    SignupPassword: { email: string; name: string; preferences: string; onSignupComplete?: (email: string) => void };
};

type Props = {
    navigation: NativeStackNavigationProp<SignupStackParamList, 'SignupCodebase'>;
    route: RouteProp<SignupStackParamList, 'SignupCodebase'>;
};

export const SignupCodebaseScreen: React.FC<Props> = ({ navigation, route }) => {
    const { email, name, preferences } = route.params;
    const promptText = `# Prompt for Coding Agent: Orecce Workspace Analysis

## Role
You are an expert software analyst and technical documenter.

## Goal
Analyze this repository and produce a single Markdown file that clearly explains what this project is, how it works, and which tools, platforms, and dependencies it relies on.  
This file will be consumed by an external AI system (Orecce) to monitor relevant news such as new tools, breaking changes, competitors, and ecosystem updates that may affect this project.

## Instructions

1. Scan the entire repository.
   - Read README.md, configuration files, package manifests, lockfiles, CI/CD configs, infrastructure files, and source code where useful.
   - Infer intent where documentation is missing, but do not hallucinate. Clearly mark assumptions.

2. Create a new file at the root of the repository.
   - Filename: ORECCE_CONTEXT.md
   - Output only valid Markdown.
   - Do not modify or create any other files.

3. Populate the file using the exact structure below.

---

# Project Overview
- Project name:
- One-sentence description of what this project does:
- Primary users:
- Problem it solves:

# Product & Domain
- Product category (e.g. SaaS, developer tool, mobile app, internal tool):
- Industry/domain:
- Core value proposition:

# Architecture Summary
- High-level architecture (frontend, backend, workers, infrastructure, etc.):
- Programming languages used:
- Frameworks and major libraries:
- Deployment environment (cloud provider, serverless, containers, etc.):

# Key Technologies & Products Used
List important external products, platforms, or services this project depends on:
- Cloud providers:
- Databases and storage:
- APIs and external services:
- AI models or ML frameworks (if any):
- DevOps / CI/CD tools:
- Authentication, payments, analytics, or monitoring tools:

# Workflow & Developer Experience
- How developers typically run the project locally:
- How it is built, tested, and deployed:
- Notable workflow tools, scripts, or conventions:

# Integrations & Dependencies That Matter
List dependencies where updates, pricing changes, policy shifts, or breaking changes would significantly impact this project.

# Competitive & Ecosystem Context
- Types of products that could be considered competitors:
- Adjacent tools or platforms this project competes with or replaces:
- Open-source vs commercial positioning (if applicable):

# Assumptions & Uncertainties
List anything inferred but not explicitly stated in the repository.

# Keywords for Monitoring
Provide a concise list of keywords, product names, frameworks, APIs, and technical terms that would be useful for monitoring news relevant to this project.

---

4. Quality bar
   - Be concise, precise, and factual.
   - Prefer concrete product and tool names over generic descriptions.
   - The document should allow someone to understand the project without reading the code.

5. Do not
   - Add marketing language
   - Invent business strategy or features
   - Include explanations outside the Markdown file`;
    const [agentOutput, setAgentOutput] = useState('');
    const hasOutput = agentOutput.trim().length > 0;
    const scrollRef = useRef<ScrollView | null>(null);

    const handleBack = () => {
        navigation.goBack();
    };

    const handleNext = () => {
        navigation.navigate('SignupPassword', {
            email,
            name,
            preferences,
        });
    };

    const handleSkip = () => {
        navigation.navigate('SignupPassword', {
            email,
            name,
            preferences,
        });
    };

    const copyToClipboard = async () => {
        await Clipboard.setStringAsync(promptText);
        Alert.alert('Copied', 'Text copied to clipboard!');
    };

    React.useEffect(() => {
        const showSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        );
        const hideSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        );
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    return (
        <SignupStepLayout
            currentStep={3}
            totalSteps={4}
            title="Generate using your codebase"
            subtitle="Copy this prompt into your coding agent, then paste the output below to keep things tailored."
            onBack={handleBack}
            onNext={hasOutput ? handleNext : handleSkip}
            nextLabel={hasOutput ? '›' : 'Skip'}
        >
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <ScrollView
                        ref={scrollRef}
                        style={styles.container}
                        contentContainerStyle={styles.scrollContainer}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        automaticallyAdjustKeyboardInsets
                        contentInset={{ bottom: 260 }}
                        contentInsetAdjustmentBehavior="always"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.scrollBoxContainer}>
                            <ScrollView
                                style={styles.scrollBox}
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.scrollText}>{promptText}</Text>
                            </ScrollView>
                            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
                                <Feather name="copy" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Output from your coding agent:</Text>
                            <TextInput
                                style={[styles.input, styles.outputInput]}
                                value={agentOutput}
                                onChangeText={setAgentOutput}
                                placeholder="Paste the response you get back so we can keep things tailored"
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                multiline
                                textAlignVertical="top"
                                onSubmitEditing={Keyboard.dismiss}
                                blurOnSubmit
                                onFocus={() => {
                                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
                                }}
                            />
                        </View>
                    </ScrollView>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SignupStepLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContainer: {
        paddingBottom: 0,
    },
    inputContainer: {
        marginTop: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 12,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        color: colors.textPrimary,
        backgroundColor: colors.white,
    },
    outputInput: {
        minHeight: 200,
        lineHeight: 20,
    },
    bottomLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    scrollBoxContainer: {
        backgroundColor: colors.backgroundLight,
        borderRadius: 12,
        padding: 12,
        height: 100,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
    },
    scrollBox: {
        flex: 1,
        marginRight: 8,
    },
    scrollText: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    copyButton: {
        alignSelf: 'flex-start',
        padding: 4,
    },
});

export default SignupCodebaseScreen;
